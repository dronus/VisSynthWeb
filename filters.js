// Implement all video filters ("effects").
//
// -filters may be "sources", that don't use any input despite their own, eg. "capture" a video camera
// -filters may be filters, thus reading one or more textures to produce their output, eg. "invert"
// -filters may be "setting"-filters, that change some Canvas settings without rendering anything, eg. "resolution".
//
// Filters are implemented as functions called with "this" being the Canvas. 
// The most of them are just calling "simpleShader" to render a WebGL GLSL shader into their output texture.
//
// State (eg. caches) can be stored at this._.FILTERNAME_... . 
// There is NO individual state for multiple instances in a single effect chain.
//

import {Shader} from "./shader.js";
import {Texture} from "./texture.js"
import {audio_engine} from "./audio.js"
import {midi} from "./midi.js"
import {vec3, mat3, mat4, quat4} from "./glmatrix.js"

function clamp(lo, value, hi) {
    return Math.max(lo, Math.min(value, hi));
}

// collection of filter functions.
// filters will be called with "this" pointing to the calling Canvas.
export let filters={};

// no-op filter for UI purposes.
filters.none=function(){};

// side-effect filter to switch to another chain
filters.switch_chain_time=0;
filters.switch_chain=function(chain_index,time_min,time_max) {
  if(this.switched) 
    this.switch_chain_time=Date.now()+time_min*1000. + Math.random()*(time_max-time_min)*1000.;
  
  if(Date.now()>this.switch_chain_time){
    switchChain(Math.floor(chain_index));
    // prevent re-trigger until chain switch, which may take some cycles
    this.switch_chain_time=Infinity;
  }
}

filters.fps=function(fps){
  this.proposed_fps=fps;
};

filters.type_byte=function(){
  this.template.type=this.gl.UNSIGNED_BYTE;
};

filters.type_float=function(){

  var ext=this.gl.getExtension('OES_texture_half_float');
  this.gl.getExtension('OES_texture_half_float_linear');  
  this.template.type=ext.HALF_FLOAT_OES;
};

filters.resolution=function(w,h,filtering,precision,fps_limit){
  this.resolution_w=w; this.resolution_h=h;
  this.proposed_fps=fps_limit;
  var t=this.template;
  t.width=w;
  t.height=h;

  if(precision=='linear') this.type_byte();
  if(precision=='float')  this.type_float();

  filters.filtering.call(this,filtering=="linear" ? 1 : 0);
};

filters.filtering=function(linear) {
  this.template.filter=linear>0 ? this.gl.LINEAR : this.gl.NEAREST;
}

// TODO check if clamping can be done by texture border modes in today's WebGL implementations
var warpShader=function(canvas, name, uniforms, warp) {
    return canvas.getShader(name, null, uniforms + '\
    uniform sampler2D texture;\
    varying vec2 texCoord;\
    void main() {\
        vec2 coord = texCoord-vec2(0.5);\
        ' + warp + '\
        coord+=vec2(0.5);\
        gl_FragColor = texture2D(texture, coord);\
        vec2 clampedCoord = clamp(coord, vec2(0.0), vec2(1.0));\
        if (coord != clampedCoord) {\
            /* fade to transparent black if we are outside the image */\
             gl_FragColor *= max(0.0, 1.0 - length(coord - clampedCoord) * 1000.); \
        }\
    }');
}

// returns a random number between 0 and 1
var randomShaderFunc = '\
    float random(vec3 scale, float seed) {\
        /* use the fragment position for a different seed per-pixel */\
        return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);\
    }\
';

filters.blend_alpha=function(alpha) {

    alpha=alpha||1.0;

    let s_blend_alpha = this.getShader('s_blend_alpha', null, '\
        uniform sampler2D texture1;\
        uniform sampler2D texture2;\
        uniform float alpha;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color1 = texture2D(texture1, texCoord);\
            vec4 color2 = texture2D(texture2, texCoord);\
            gl_FragColor = mix(color1, color2, color2.a*alpha);\
        }\
    ');

    var texture1=this.stack_pop();
    s_blend_alpha.textures({texture2: this.texture, texture1: texture1});
    this.simpleShader( s_blend_alpha, {alpha:clamp(0.,alpha,1.)});

    return this;
}

filters.multiply=function() {
    let s_multiply = this.getShader('s_multiply',  null, '\
        uniform sampler2D texture1;\
        uniform sampler2D texture2;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color1 = texture2D(texture1, texCoord);\
            vec4 color2 = texture2D(texture2, texCoord);\
            gl_FragColor = color1 * color2;\
        }\
    ');

    var texture1=this.stack_pop();
    s_multiply.textures({texture2: this.texture, texture1: texture1});
    this.simpleShader( s_multiply, {});

    return this;
}


filters.blend_mask=function() {
    let s_blend_mask = this.getShader('s_blend_mask', null, '\
        uniform sampler2D texture1;\
        uniform sampler2D texture2;\
        uniform sampler2D mask;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color1 = texture2D(texture1, texCoord);\
            vec4 color2 = texture2D(texture2, texCoord);\
            float alpha = dot(texture2D(mask, texCoord).rgb,vec3(1./3.));\
            gl_FragColor = mix(color1, color2, alpha);\
        }\
    ');

    var texture2=this.stack_pop();
    var texture1=this.stack_pop();
    s_blend_mask.textures({mask: this.texture, texture1: texture1, texture2: texture2});
    this.simpleShader( s_blend_mask, {});

    return this;
}


filters.superquadric=function(A,B,C,r,s,t,angle) {
    let s_superquadric = this.getShader('s_superquadric',  '\
    attribute vec3 vertex;\
    attribute vec2 _texCoord;\
    varying vec2 texCoord;\
    uniform mat4 matrix;\
    void main() {\
        texCoord = _texCoord;\
        vec4 pos=matrix * (vec4(vertex,1.0));  \
        gl_Position = pos/pos.w; \
    }','\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          gl_FragColor = rgba;\
        }\
    ');

  function superquadric_p(u,v,A,B,C,r,s,t) {
      // parametric equations for superquadric, from http://en.wikipedia.org/wiki/Superquadrics 
      //   with respect to surface lat-lon params (u,v)
      //   having scaling values along shape x,y,z axes (A,B,C)
      //   and shape definition exponents along shape x,y,z axes (r,s,t)
      //
      //   x(u,v) = A*c(v,2/r)*c(u,2/r)
      //   y(u,v) = B*c(v,2/s)*s(u,2/s)
      //   z(u,v) = C*s(v,2/t)
      //
      // aux functions 
      //   c(w,m) = sgn(cos(w))*abs(cos(w))^m
      //   s(w,m) = sgn(sin(w))*abs(sin(w))^m
      var point = [];
      point.x = A*superquadric_c(v,2/r)*superquadric_c(u,2/r);
      point.y = B*superquadric_c(v,2/s)*superquadric_s(u,2/s);
      point.z = C*superquadric_s(v,2/t);
      return point;
  }
  function superquadric_c(w,m) {
      if (typeof Math.sign !== 'undefined') 
          return Math.sign(Math.cos(w))*Math.pow(Math.abs(Math.cos(w)),m);
      else
          return Math_sign(Math.cos(w))*Math.pow(Math.abs(Math.cos(w)),m);
          // why does Chrome not have Math.sign(); that seems unwise
  }
  function superquadric_s(w,m) {
      if (typeof Math.sign !== 'undefined') 
          return Math.sign(Math.sin(w))*Math.pow(Math.abs(Math.sin(w)),m);
      else
          return Math_sign(Math.sin(w))*Math.pow(Math.abs(Math.sin(w)),m);  
          // why does Chrome not have Math.sign(); that seems unwise
  }
  function Math_sign(a) {
      if (a < 0) return -1;
      else if (a > 0) return 1;
      else return 0;
  }



    var vertices=[];
    var uvs=[];










    // squad = [];
    // squad.scaling = {A:1, B:1, C:1};
    //squad.shape = {r:2, s:2, t:2};  // start as sphere
    //squad.shape = {r:10, s:10, t:10};  // start as rounded cube
    //squad.shape = {r:0.6, s:0.6, t:0.6};  // my favorite
    for (sv=-Math.PI/2,i=0;sv<=Math.PI/2;sv+=Math.PI/25,i++) { 
        for (su=-Math.PI,j=0;su<=Math.PI;su+=Math.PI/50,j++) { 
        
            var u=su/Math.PI/2+0.5;
            var v=sv/Math.PI+0.5;

            var sv2=sv-Math.PI/25;
            var v2=sv2/Math.PI+0.5;
        
            var p1 = superquadric_p(su,sv,A,B,C,r,s,t);
            vertices.push(p1.x,p1.z,p1.y);
            uvs.push(u,v);

            var p2 = superquadric_p(su,sv2,A,B,C,r,s,t);
            vertices.push(p2.x,p2.z,p2.y);
            uvs.push(u,v2);
                
        }
    }










    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);

    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-5.]);
    mat4.rotate(matrix,angle,[0.0,1.0,0.0]);    
    
    mat4.multiply(proj,matrix,matrix);
    
    var uniforms={
      matrix:matrix
    };

  
    this.texture.use(0);
    var target=this.getSpareTexture();
    target.setAsTarget();
    let gl=this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    s_superquadric.attributes({vertex:vertices,_texCoord:uvs},{vertex:3,_texCoord:2});
    s_superquadric.uniforms(uniforms).drawArrays(gl.TRIANGLE_STRIP);
    gl.disable(gl.DEPTH_TEST);
    this.setTexture(target);
    
    return this;
}

filters.feedbackIn=function() {
    // Store a copy of the current texture in the feedback texture unit
    this._.feedbackTexture=this.getSpareTexture(this._.feedbackTexture);

    this.texture.copyTo(this._.feedbackTexture);

    return this;
}

filters.strobe=function(period) {
    var t=this.texture;
    this._.strobeTexture=this.getSpareTexture(this._.strobeTexture);

    this._.strobePhase=((this._.strobePhase|0)+1.) % period;
    if(this._.strobePhase==0) this.texture.copyTo(this._.strobeTexture);
    else                      this._.strobeTexture.copyTo(this.texture);

    return this;
}

filters.tile=function(size,centerx,centery) {
    let s_tile = this.getShader('s_tile',  null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
      	uniform float size;\
        varying vec2 texCoord;\
        void main() {\
          vec4 color = texture2D(texture, fract((texCoord-center)*size));\
          gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_tile, {size:size,center: [centerx,centery]});

    return this;
}


filters.supershape=function(angleX,angleY,a1,b1,m1,n11,n21,n31,a2,b2,m2,n12,n22,n32) {

  if(!this.shaders['s_supershape'])
  {
    this.getShader('s_supershape', '\
      float superFormula(in float a, in float b, in float m, in float n1, in float n2, in float n3, in float phi)\
      {\
          vec2 ret;\
          float Out;\
          float t1 = cos(m * phi / 4.0);\
          t1 = t1 / a;\
          t1 = abs(t1);\
          t1 = pow(t1, n2);\
          float t2 = sin(m * phi / 4.0);\
          t2 = t2 / b;\
          t2 = abs(t2);\
          t2 = pow(t2, n3);\
          float T = t1 + t2;\
          Out = pow(T, 1.0 / n1);\
          if (abs(Out) == 0.0) {\
              Out = 0.0;\
          } else {\
              Out = 1.0 / Out;\
          }\
       \
          return Out;\
      }\
      \
      uniform float a;\
      uniform float b;\
      uniform float m;\
      uniform float n1;\
      uniform float n2;\
      uniform float n3;\
      uniform float ab;\
      uniform float bb;\
      uniform float mb;\
      uniform float n1b;\
      uniform float n2b;\
      uniform float n3b;\
      \
      attribute vec2 _texCoord;\
      varying vec2 texCoord;\
      uniform mat4 matrix;\
      \
      float PI=3.14159;\
      \
      void main()\
      {\
          vec2 uv = (_texCoord-vec2(0.5)) * vec2(2.*PI,PI);\
           \
          float rt = superFormula(a,b,m, n1, n2, n3, uv.x);\
          float rp = superFormula(ab,bb,mb, n1b, n2b, n3b, uv.y);\
          float st = sin(uv.x);\
          float ct = cos(uv.x);\
          float sp = sin(uv.y);\
          float cp = cos(uv.y);\
           \
          vec4 pos;\
          pos.x = rt * ct * rp * cp;\
          pos.z = rt * st * rp * cp;\
          pos.y = rp * sp;\
          pos.w=1.;\
                \
          texCoord = _texCoord;\
          pos=matrix*pos;\
          gl_Position = pos/pos.w;\
      }','\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          gl_FragColor = rgba;\
        }\
      ');
      var uvs=[];
      for (sv=-Math.PI/2,i=0;sv<=Math.PI/2;sv+=Math.PI/50,i++) { 
          for (su=-Math.PI,j=0;su<=Math.PI;su+=Math.PI/100,j++) { 
          
              var u=su/Math.PI/2+0.5;
              var v=sv/Math.PI+0.5;

              var sv2=sv-Math.PI/25;
              var v2=sv2/Math.PI+0.5;
          
              uvs.push(u,v);
              uvs.push(u,v2);                  
          }
      }
      this.shaders['s_supershape'].attributes({_texCoord:uvs},{_texCoord:2});
    }
       
    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);
    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-5.]);
    mat4.rotate(matrix,angleX,[1.0,0.0,0.0]);
    mat4.rotate(matrix,angleY,[0.0,1.0,0.0]);
    mat4.multiply(proj,matrix,matrix);
    
    var uniforms={
      a: a1, b: b1, m:m1, n1:n11, n2:n21, n3:n31,
      ab: a2, bb: b2, mb:m2, n1b:n12, n2b:n22, n3b:n32,
      matrix:matrix
    };

    var supershapeMeshUVs=this._.supershapeMeshUVs;
    this.texture.use(0);
    var target=this.getSpareTexture();
    target.setAsTarget();
    let gl=this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 
    this.shaders['s_supershape'].uniforms(uniforms).drawArrays(gl.TRIANGLE_STRIP);
    gl.disable(gl.DEPTH_TEST);
    this.putTexture(target);
    
    return this;
}


filters.superellipse=function(size,angle,a,b,m,n1,n2,n3) {
    let s_superellipse = this.getShader('s_superellipse',  null, '\
      varying vec2 texCoord;\
      uniform mat3 transform;\
      uniform float a;\
      uniform float b;\
      uniform float m;\
      uniform float n1;\
      uniform float n2;\
      uniform float n3;\
      void main() {\
          vec2 uv=(transform*vec3(texCoord-vec2(0.5,0.5),1.0)).xy;\
          uv=mod(uv,vec2(1.0,1.0))-vec2(0.5,0.5);\
          float phi=atan(uv.x,uv.y);\
          float t1 = cos(m * phi / 4.0);\
          t1 = t1 / a;\
          t1 = abs(t1);\
          t1 = pow(t1, n2);\
          float t2 = sin(m * phi / 4.0);\
          t2 = t2 / b;\
          t2 = abs(t2);\
          t2 = pow(t2, n3);\
          float T = t1 + t2;\
          float Out = pow(T, 1.0 / n1);\
          if (abs(Out) == 0.0) {\
              Out = 0.0;\
          } else {\
              Out = 1.0 / Out;\
          }\
          float r=sqrt(dot(uv,uv));\
          \
          gl_FragColor = mix(vec4(0.0,0.0,0.0,1.0),vec4(1.0,1.0,1.0,1.0),(Out-r)+0.5);\
      }\
    ');

    var sx=size/this.width, sy=size/this.height;
    var transform=[
       Math.sin(angle)/sx,Math.cos(angle)/sx,0,
      -Math.cos(angle)/sy,Math.sin(angle)/sy,0,
                        0,                 0,1
    ];
    this.simpleShader( s_superellipse, {transform:transform,a:a,b:b,m:m,n1:n1,n2:n2,n3:n3});

    return this;
};


filters.grating=function(size,angle,ax,fx,ay,fy) {
    let s_grating = this.getShader('s_grating',  null, '\
      varying vec2 texCoord;\
      uniform mat3 transform;\
      uniform float ax;\
      uniform float fx;\
      uniform float ay;\
      uniform float fy;\
      void main() {\
          vec2 uv=(transform*vec3(texCoord-vec2(0.5,0.5),1.0)).xy;\
          float x=ax*sin(fx*uv.x)*ay*cos(fy*uv.y);\
          gl_FragColor = vec4(vec3(x+0.5),1.0);\
      }\
    ');

    var sx=size/this.width, sy=size/this.height;
    var transform=[
       Math.sin(angle)/sx,Math.cos(angle)/sx,0,
      -Math.cos(angle)/sy,Math.sin(angle)/sy,0,
                        0,                 0,1
    ];
    this.simpleShader( s_grating, {transform:transform,ax:ax,fx:fx,ay:ay,fy:fy});

    return this;
};


filters.colorDisplacement=function(angle,amplitude) {
    let s_colorDisplacement = this.getShader('s_colorDisplacement',  null,'\
    \
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        uniform vec2 texSize;\
        uniform float angle;\
        uniform float amplitude;\
      void main(void){ \
        float pi=3.14159; \
        vec2 p3=vec2(pi*2./3.,pi*2./3.); \
        vec2 angles=vec2(angle,angle+pi/2.); \
        vec2 or=sin(angles+0.*p3)/texSize*amplitude; \
        vec2 og=sin(angles+1.*p3)/texSize*amplitude; \
        vec2 ob=sin(angles+2.*p3)/texSize*amplitude; \
        gl_FragColor=vec4( \
            texture2D(texture,texCoord+or).r, \
            texture2D(texture,texCoord+og).g, \
            texture2D(texture,texCoord+ob).b, \
        1.0); \
        } \
    ');

    this.simpleShader( s_colorDisplacement, {
        angle: angle,    
        amplitude: amplitude,
        texSize: [this.width, this.height]        
    });

    return this;
}

filters.matte=function(r,g,b,a) {
    let s_matte = this.getShader('s_matte',  null, '\
        uniform vec4 color;\
        void main() {\
            gl_FragColor = color;\
        }\
    ');
    if(typeof(a)=='undefined') a=1.; // legacy
    this.simpleShader( s_matte, {color:[r,g,b,a]});
    return this;
}


filters.noise=function(seed) {
    let s_noise = this.getShader('s_noise',  null, '\
        varying vec2 texCoord;\
        uniform float seed;\
        vec3 noise3(vec3 t){\
          vec3 dots=vec3(\
            dot(t ,vec3(12.9898,78.233,55.9274)),\
            dot(t ,vec3(22.9898,68.233,65.9274)),\
            dot(t ,vec3(32.9898,58.233,75.9274))\
          );\
          return fract(sin(dots) * 43758.5453);\
        }\
        void main() {\
            gl_FragColor = vec4(noise3(vec3(texCoord,seed)),1.0);\
        }\
    ');
    this.simpleShader( s_noise, {seed:seed});
    return this;
}


filters.polygon_matte=function(r,g,b,a,sides,x,y,size,angle,aspect) {

    let s_polygon_matte = this.getShader('s_polygon_matte',  null, '\
        uniform vec4 color;\
        uniform vec2 size;\
        uniform float sides;\
        uniform float angle;\
        uniform vec2 center;\
        varying vec2 texCoord;\
        float PI=3.14159; \
        void main() {\
            vec2 uv=texCoord-vec2(0.5,0.5)-center;\
            uv/=size;\
            \
            float a=atan(uv.x,uv.y)-angle; \
            float r=length(uv); \
            \
            float d = r / (cos(PI/sides)/cos(mod(a,(2.*PI/sides))-(PI/sides))); \
            \
            if(d<1.) \
              gl_FragColor=color; \
            else \
              gl_FragColor=vec4(0.); \
        }\
    ');

    this.simpleShader( s_polygon_matte, {
        color:[r,g,b,a],
        size:[size*this.height/this.width,size*aspect],
        sides:Math.floor(sides),
        angle:angle,
        center: [x,y]
    });

    return this;
}

filters.rectangle=function(r,g,b,a,x,y,width,height,angle) {

    let s_rectangle = this.getShader('s_rectangle',  null, '\
        uniform vec4 color;\
        uniform vec2 size;\
        uniform float angle;\
        uniform vec2 center;\
        varying vec2 texCoord;\
        float PI=3.14159; \
        void main() {\
            vec2 uv=texCoord-vec2(0.5,0.5)-center;\
            uv/=size;\
            if(abs(uv.x)<1. && abs(uv.y)<1.) \
              gl_FragColor=color; \
            else \
              gl_FragColor=vec4(0.); \
        }\
    ');

    this.simpleShader( s_rectangle, {
        color:[r,g,b,a],
        size:[width*this.height/this.width,height],
        angle:angle,
        center: [x,y]
    });

    return this;
}


filters.video=function(url,play_sound,speed,loop) {
    if(!this._.videoFilterElement) this._.videoFilterElement={};
    var v=this._.videoFilterElement[url];
    if(!v)
    {
      var v = document.createElement('video');
      v.muted=!play_sound;
      v.loop=loop;
      v.crossOrigin = "anonymous";
      v._urls=url.split(' ');
      v._urlIndex=-1;
      // loop workaround: loop=true requires HTTP range request capability of the server for some browsers (like seek would do).
      // so we just start the video anew completely.
      var playNext=function()
      {
         v._urlIndex++;
         if(v._urlIndex>=v._urls.length) v._urlIndex=0;
	 v.src = v._urls[v._urlIndex];
         v.load();
         v.play();
      }
      v.onended = playNext;
      playNext();
      this._.videoFilterElement[url]=v;
    }  
      
    v.playbackRate=speed || 1.0;

    // make sure the video has adapted to the video source
    if(v.currentTime==0 || !v.videoWidth) return this;

    if(!this._.videoTexture) this._.videoTexture=this.toTexture(v);
    this._.videoTexture.loadContentsOf(v);
    var target=this.getSpareTexture();
    this._.videoTexture.copyTo(target);
    this.putTexture(target);
        
    return this;
}

var image_loaded=[];
filters.image=function(url) {

    if(!this._.imageFilterElement) this._.imageFilterElement=[];
    var v=this._.imageFilterElement[url];

    if(!v)
    {
      var v = document.createElement('img');
      v.crossOrigin = "anonymous";
      v.src=url;
      this._.imageFilterElement[url]=v;
      v.onload=function(){
          image_loaded[url]=true;
      }
    }  
      
    // make sure the image has adapted to the image source
    if(!this._.imageTexture) this._.imageTexture=[];
    if(!this._.imageTexture[url] && image_loaded[url])
    {
      this._.imageTexture[url]=this.getSpareTexture(null,v.width,v.height);
      this._.imageTexture[url].loadContentsOf(v);
    }
    
    if(this._.imageTexture[url])
    {
      var target=this.getSpareTexture();
      this._.imageTexture[url].copyTo(target);
      this.putTexture(target);
    }
        
    return this;
}


filters.ripple=function(fx,fy,angle,amplitude) {
    let s_ripple = warpShader(this, 's_ripple', '\
        uniform vec4 xform;\
        uniform float amplitude;\
    ', '\
        mat2 mat=mat2(xform.xy,xform.zw);\
        coord += amplitude*sin(mat*coord);\
    ');

    this.simpleShader( s_ripple, {
        xform: [
           Math.cos(angle)*fx, Math.sin(angle)*fy,
          -Math.sin(angle)*fx, Math.cos(angle)*fy
        ],
        amplitude: amplitude,
    });

    return this;
}

filters.spherical=function(radius,scale) {
    let s_spherical = warpShader(this, 's_spherical', '\
        uniform float radius;\
        uniform float scale;\
    ', '\
        float l=length(coord);\
        /* float l2=l-radius; */ \
        float l2=-1.0/(l/radius-1.0)-1.0;\
        coord*=(l2/l/scale);\
    ');

    this.simpleShader( s_spherical, {
        radius: radius,
        scale : scale,
    });

    return this;
}


var mesh_transforms={
  'plane':'pos.xy=pos.xy+vec2(-0.5,-0.5);',
  'cylinder':"\
    vec4 p=pos;\
    float a=3.14159 * 2.0 * p.x;\
    pos.xy=vec2(sin(a)*(pos.z+1.0),-cos(a)*(pos.z+1.0));\
    pos.z = p.y * 6.0;\
    pos.xyz=pos.xyz*.2;\
  ",
  'sphere':"\
    vec4 p=pos;\
    float a=3.14159 * 2.0 * p.x;\
    float b=3.14159 * 1.0 * p.y;\
    pos.xyz=vec3(sin(a)*sin(b),-cos(a),sin(a)*-cos(b)) * (pos.z+1.0);\
    pos.z = p.y * 6.0;\
    pos.xyz=pos.xyz*.2;\
  ",
};

filters.mesh_displacement=function(sx,sy,sz,anglex,angley,anglez,mesh_type) {

    if(!mesh_transforms[mesh_type]) mesh_type="plane";

    if(!this.shaders.s_mesh_displacement) this.shaders.s_mesh_displacement={};
    if(!this.shaders.s_mesh_displacement[mesh_type])
    {
    this.shaders.s_mesh_displacement[mesh_type] = new Shader(this.gl, '\
    attribute vec2 _texCoord;\
    varying vec2 texCoord;\
    uniform mat4 matrix;\
    uniform sampler2D displacement_map;\
    uniform vec3 strength;\
    void main() {\
        texCoord = _texCoord;\
        vec3 dis = texture2D(displacement_map, _texCoord).xyz-0.5;\
        vec4 pos= (vec4(vec3(_texCoord,0.0)+dis*strength,1.0));\
        '+mesh_transforms[mesh_type]+' \
        pos=matrix * pos;\
        gl_Position = pos/pos.w;\
    }');
    // generate grid mesh
    // TODO resolve cache rot, the resolution of the mesh is baked on first use and doesn't adapt the screen
    var gridMeshUvs=[];
    //var dx=1./640.;
    //var dy=1./480.;    
    var dx=4./this.width;
    var dy=4./this.height;
    for (var y=0.0;y<=1.0;y+=dy) {
        for (var x=0.0;x<=1.0;x+=dx) {        
            gridMeshUvs.push(x,y);
            gridMeshUvs.push(x,y-dy);
        }
        // add zero area 'carriage return' triangles to prevent glitches
        gridMeshUvs.push(1.0,y-dy);
        gridMeshUvs.push(1.0,y-dy);
        gridMeshUvs.push(0.0,y-dy);
        gridMeshUvs.push(0.0,y-dy);
    }
    this.shaders.s_mesh_displacement[mesh_type].attributes({_texCoord:gridMeshUvs},{_texCoord:2});
    }
    var mesh_shader=this.shaders.s_mesh_displacement[mesh_type];

    // perspective projection matrix
    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);
    // camera placement transformation matrix
    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-2.]);
    mat4.rotate(matrix,anglex,[1.0,0.0,0.0]);
    mat4.rotate(matrix,angley,[0.0,1.0,0.0]);
    mat4.rotate(matrix,anglez,[0.0,0.0,1.0]);
    mat4.scale(matrix,[2.0,2.0,2.0]);
    mat4.scale(matrix,[this.width/this.height,1.0,1.0]);
//    mat4.translate(matrix,[-.5,-.5,0]);
    mat4.multiply(proj,matrix,matrix);
    
    // set shader parameters
    mesh_shader.uniforms({
      matrix:matrix,
      strength: [sx,sy,sz]
    });
    
    // set shader textures
    mesh_shader.textures({displacement_map: this.texture, texture: this.stack_pop()});

    // render 3d mesh stored in vertices,uvs to spare texture
    var target=this.getSpareTexture();
    target.setAsTarget();
    let gl=this.gl;
    gl.enable(gl.DEPTH_TEST);
//        gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    mesh_shader.drawArrays(gl.TRIANGLE_STRIP);
    gl.disable(gl.DEPTH_TEST);
//        gl.disable(gl.CULL_FACE);
    // replace current texture by spare texture
    this.putTexture(target);
 
    return this;
}

filters.blend=function(alpha,factor,offset) {
    let s_blend = this.getShader('s_blend',  null, '\
        uniform sampler2D texture;\
        uniform sampler2D texture1;\
        uniform float alpha;\
        uniform float factor;\
        uniform float offset;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color  = texture2D(texture , texCoord);\
            vec4 color1 = texture2D(texture1, texCoord);\
            gl_FragColor = mix(color, color1, alpha) * factor + vec4(offset,offset,offset,0.0);\
        }\
    ');

    s_blend.textures({texture: this.texture, texture1: this.stack_pop()});
    this.simpleShader( s_blend, { alpha: alpha, factor: factor ? factor : 1.0 , offset: offset ? offset : 0.0});

    return this;
}

filters.kaleidoscope=function(sides,angle,angle2) {
    let s_kaleidoscope = this.getShader('s_kaleidoscope',  null, '\
        uniform sampler2D texture;\
	uniform float angle;\
	uniform float angle2;\
	uniform float sides;\
        varying vec2 texCoord;\
	void main() {\
		vec2 p = texCoord - 0.5;\
		float r = length(p);\
		float a = atan(p.y, p.x) + angle;\
		float tau = 2. * 3.1416 ;\
		a = mod(a, tau/sides);\
		a = abs(a - tau/sides/2.) * 1.5 ;\
		p = r * 2. * vec2(cos(a+angle2), sin(a+angle2));\
		vec4 color = texture2D(texture, mod(p + 0.5,vec2(1.,1.)));\
		gl_FragColor = color;\
	}\
    ');

    this.simpleShader( s_kaleidoscope, {sides:Math.round(sides), angle:angle, angle2:angle2});

    return this;
}


filters.mandelbrot=function(x,y,scale,angle,iterations) {

    iterations=Math.min(15,Math.abs(iterations));

    // use a single shader.
    // another implementation used one shaderi source per int(iterations), but Odroid XU4 crashed on that. On U3, it was fine.
    let s_mandelbrot = this.getShader('s_mandelbrot',  null, '\
        uniform sampler2D texture;\
        uniform vec4 xform;\
        uniform vec2 center;\
        uniform float iterations; \
        varying vec2 texCoord;\
        void main() {\
            mat2 mat=mat2(xform.xy,xform.zw);\
            vec2 c=mat*(texCoord-center);\
            vec2 z; \
            vec2 nz=c; \
            for (int iter = 0;iter <= 15; iter++){ \
              if(iter>=int(iterations)) break;  \
              z = nz; \
              nz = vec2(z.x*z.x-z.y*z.y, 2.0*z.x*z.y) + c ; \
            } \
            vec2 pos=mix(z,nz,fract(iterations));\
            gl_FragColor = texture2D(texture, pos/8.0+vec2(0.5,0.5));\
        }\
    ');

    this.simpleShader( s_mandelbrot, {
        xform: [
           Math.cos(angle)*scale, Math.sin(angle)*scale,
          -Math.sin(angle)*scale, Math.cos(angle)*scale
        ],
        iterations  : iterations,
        center: [x,y]
    });

    return this;
}

filters.julia=function(cx,cy,x,y,scale,angle,iterations) {

    iterations=Math.min(15,Math.abs(iterations));

    // use a single shader.
    // another implementation used one shaderi source per int(iterations), but Odroid XU4 crashed on that. On U3, it was fine.
    let s_julia = this.getShader('s_julia',  null, '\
        uniform sampler2D texture;\
        uniform vec4 xform;\
        uniform vec2 center;\
        uniform vec2 c;\
        uniform float iterations; \
        varying vec2 texCoord;\
        void main() {\
            mat2 mat=mat2(xform.xy,xform.zw);\
            vec2 z; \
            vec2 nz=mat*(texCoord-center); \
            for (int iter = 0;iter <= 15; iter++){ \
              if(iter>=int(iterations)) break;  \
              z = nz; \
              nz = vec2(z.x*z.x-z.y*z.y, 2.0*z.x*z.y) + c ; \
            } \
            vec2 pos=mix(z,nz,fract(iterations));\
            gl_FragColor = texture2D(texture, pos/8.0+vec2(0.5,0.5));\
        }\
    ');

    this.simpleShader( s_julia, {
        xform: [
           Math.cos(angle)*scale, Math.sin(angle)*scale,
          -Math.sin(angle)*scale, Math.cos(angle)*scale
        ],
        iterations  : iterations,
        c: [cx,cy], 
        center: [x,y],
        texSize: [this.width, this.height]
    });

    return this;
}


filters.relief=function(scale2,scale4) {
      this.gl.getExtension('OES_standard_derivatives');
      let s_blur = simpleBlurShader(this);
      let s_relief = this.getShader('s_relief',  null,'\n\
      #extension GL_OES_standard_derivatives : enable\n\
      uniform sampler2D texture;\n\
      uniform sampler2D texture_blur2;\n\
      uniform sampler2D texture_blur4;\n\
      varying vec2 texCoord;\n\
      uniform vec2 texSize;\n\
         \n\
      void main(void) {\n\
        gl_FragColor = vec4(1.-abs(texture2D(texture, texCoord).y*2.-1.)); \n\
       \n\
        vec2 d = texSize*1.; \n\
        vec2 gy; // green texCoord gradient vector \n\
        gy.x = dFdx(texture2D(texture, texCoord).y); \n\
        gy.y = dFdy(texture2D(texture, texCoord).y); \n\
       \n\
        d = texSize*4.; \n\
       \n\
        vec2 gz; // blue blur2 gradient vector \n\
        gz.x = dFdx(texture2D(texture_blur2, texCoord).z)*4.0; \n\
        gz.y = dFdy(texture2D(texture_blur2, texCoord).z)*4.0; \n\
       \n\
        gl_FragColor = vec4(0.); \n\
       \n\
        gl_FragColor.y = texture2D(texture, texCoord + gz*texSize*64.).y*0.4 - (gz.x + gz.y)*0.4 + 0.4; // gradient enhancement and refraction \n\
        gl_FragColor.z = texture2D(texture_blur4, texCoord + 4.*gy - gz ).z*1.75 -0.0; // scatter/refract \n\
       \n\
        gl_FragColor.yz *= 1.- texture2D(texture_blur4, texCoord).x*2.5; // box shadow \n\
        gl_FragColor.x = texture2D(texture, texCoord).x*1.+0.25; // repaint over shadow \n\
         \n\
        gl_FragColor.y += gl_FragColor.x; // red -> yellow \n\
       \n\
        gl_FragColor.yz *= vec2(0.75,1.)- texture2D(texture_blur4, texCoord).z*1.5; // shadow \n\
        gl_FragColor.z += texture2D(texture, texCoord).z*1.5; // repaint over shadow \n\
        gl_FragColor.y += gl_FragColor.z*0.5 - 0.1; // blue -> cyan \n\
         \n\
         \n\
        gl_FragColor = clamp(gl_FragColor,0.0,1.0);\n\
         \n\
        gl_FragColor.a = 1.;\n\
      } \n\
    ');

    var texture=this.stack_push();

    var textures=[];
    var scales=[scale2,scale4];
    for(var d=1.; !(textures[0] && textures[1] ) ; d*=Math.sqrt(2))
    {
      this.simpleShader( s_blur, { delta: [d/this.width, d/this.height]});
      
      for(var s=0; s<2; s++)
        if(!textures[s] && d>scales[s])
          textures[s]=this.stack_push();          
    }
    for(var s=0; s<=2; s++)
      this.stack_pop();
      
    s_relief.textures({
        texture: texture,
        texture_blur2: textures[0],
        texture_blur4: textures[1]
    });    
    
    this.simpleShader( s_relief, {
        texSize: [1./this.width,1./this.height],
    },texture);

    return this;
}


filters.transform=function(x,y,scale,angle,sx,sy,wrap) {
    let s_transform = this.getShader('s_transform',  null, '\
        uniform sampler2D texture;\
        uniform vec2 translation;\
        uniform vec4 xform;\
        varying vec2 texCoord;\
        uniform vec2 aspect;\
        uniform float wrap;\
        void main() {\
          mat2 mat=mat2(xform.xy,xform.zw);\
          vec2 uv=(mat*(texCoord*aspect+translation-vec2(0.5,0.5))+vec2(0.5,0.5))/aspect; \
          if(wrap>=1.|| ( uv.x>=0. && uv.y>=0. && uv.x<=1. && uv.y<=1.) ) \
            gl_FragColor = texture2D(texture,fract(uv));\
          else \
            gl_FragColor = vec4(0.,0.,0.,0.); \
        }\
    ');
    
    if(!sx) sx=1.0;
    if(!sy) sy=1.0;
    this.simpleShader( s_transform, {
      translation: [x,y],
      xform: [
         Math.cos(angle)/scale/sx, Math.sin(angle)/scale/sy,
        -Math.sin(angle)/scale/sx, Math.cos(angle)/scale/sy
      ],
      aspect:[this.width/this.height,1.],
      wrap:wrap||0
    });

    return this;
}


filters.analogize=function(exposure,gamma,glow,radius) {
    let s_analogize = this.getShader('s_analogize',  null,'\
    \
      uniform sampler2D texture;\
      uniform sampler2D glow_texture;\
      varying vec2 texCoord;\
		  uniform float Glow; \
		  uniform float Exposure;\
		  uniform float Gamma;\
		  void main(void){\
		     vec3 color  = texture2D(glow_texture,vec2(texCoord)).rgb*Glow;\
		     color  += 	texture2D(texture,texCoord).rgb;\
		     color=1.0-exp(-Exposure*color);\
		     color=pow(color, vec3(Gamma,Gamma,Gamma));\
		     gl_FragColor.rgb = color;\
		     gl_FragColor.a = 1.0;\
		  } \
    ');

    // Store a copy of the current texture in the second texture unit
    this.stack_push();

    filters.blur.call(this,radius);

    s_analogize.textures({
        glow_texture: this.texture,
        texture: this.stack_pop()
    });
    this.simpleShader( s_analogize, {
        Glow: glow,
        Exposure: exposure,
        Gamma: gamma
    });

    return this;
}


filters.noalpha=function() {
    let s_noalpha = this.getShader('s_noalpha',  null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = vec4(color.rgb,1.);\
        }\
    ');
    this.simpleShader( s_noalpha, {});
    return this;
}

filters.preview=function() {
    this.preview_width=640; this.preview_height=400;
    this.gl.viewport(0,0,this.preview_width,this.preview_height);
    filters.mirror_x.call(this,this); // for some reason, picture is horizontally mirrored. Store it into the canvas the right way.
    this.gl.viewport(0,0,this.width,this.height);

    return this;
}

filters.feedbackOut=function(blend,clear_on_switch) {
    let s_feedbackOut = this.getShader('s_feedbackOut',  null, '\
        uniform sampler2D texture;\
        uniform sampler2D feedbackTexture;\
        uniform float blend;\
        varying vec2 texCoord;\
        void main() {\
            vec4 original = texture2D(texture, texCoord);\
            vec4 feedback = texture2D(feedbackTexture, texCoord);\
            gl_FragColor = mix(original, feedback, blend);\
        }\
    ');

    if(!this._.feedbackTexture) return this;
    
    if(clear_on_switch && this.switched && this._.feedbackTexture)
      this._.feedbackTexture.clear();

    s_feedbackOut.textures({
        texture: this.texture,
        feedbackTexture: this._.feedbackTexture
    });
    this.simpleShader( s_feedbackOut, {
        blend: blend
    });

    return this;
}

filters.motion=function(threshold,interval,damper) {
    let s_motionBlend = this.getShader('s_motionBlend',  null, '\
        uniform sampler2D texture;\
        uniform sampler2D motionTexture;\
        uniform float blend;\
        varying vec2 texCoord;\
        void main() {\
            vec4 original = texture2D(texture, texCoord);\
            vec4 feedback = texture2D(motionTexture, texCoord);\
            gl_FragColor = mix(original, feedback, blend);\
        }\
    ');

    let s_motion = this.getShader('s_motion',  null, '\
        uniform sampler2D texture;\
        uniform sampler2D motionTexture;\
        uniform float threshold;\
        varying vec2 texCoord;\
        void main() {\
            vec4 original = texture2D(texture, texCoord);\
            vec4 background = texture2D(motionTexture, texCoord);\
            float d=length(original.rgb-background.rgb);\
            gl_FragColor = d>threshold ? original : vec4(0.0,0.0,0.0,0.0);  \
        }\
    ');

    this._.motionTexture=this.getSpareTexture(this._.motionTexture);

    if(!this._.motionCycle || this._.motionCycle>interval)
    {
      // blend current image into mean motion texture
      var target=this.getSpareTexture();
      s_motionBlend.textures({
          texture: this.texture,
          motionTexture: this._.motionTexture
      });
      this.simpleShader( s_motionBlend, {
          blend: damper
      },this.texture,target);

      this.releaseTexture(this._.motionTexture);
      this._.motionTexture=target;

      this._.motionCycle=0;
    }
    this._.motionCycle++;

    // rebind, motionTexture was exchanged by simpleShader
    s_motion.textures({
        texture: this.texture,
        motionTexture: this._.motionTexture
    });
    this.simpleShader( s_motion, {
        threshold: threshold
    });

    return this;
}

var simpleBlurShader=function(canvas){
  return canvas.getShader('s_reaction_blur',  null, '\
      uniform sampler2D texture;\
      uniform vec2 delta;\
      varying vec2 texCoord;\
      void main() {\
          vec4 color = vec4(0.0);\
          float b=1./4.;\
          color+=b*texture2D(texture, texCoord + delta * vec2( .5, .5) );\
          color+=b*texture2D(texture, texCoord + delta * vec2(-.5, .5) );\
          color+=b*texture2D(texture, texCoord + delta * vec2( .5,-.5) );\
          color+=b*texture2D(texture, texCoord + delta * vec2(-.5,-.5) );\
          gl_FragColor = color; \
      }\
  ');
}

filters.reaction=function(noise_factor,zoom_speed,scale1,scale2,scale3,scale4) {

    this.gl.getExtension('OES_standard_derivatives');

    let s_reaction_blur = simpleBlurShader(this);
    
    let s_reaction = this.getShader('s_reaction',  null,'\n\
      #extension GL_OES_standard_derivatives : enable\n\
      uniform sampler2D texture;\n\
      uniform sampler2D texture_blur;\n\
      uniform sampler2D texture_blur2;\n\
      uniform sampler2D texture_blur3;\n\
      uniform sampler2D texture_blur4;\n\
      uniform float noise_factor;\n\
      uniform float zoom_speed;\n\
      varying vec2 texCoord;\n\
      uniform vec2 texSize;\n\
      uniform vec4 rnd;\n\
      \
      \n\
      bool is_onscreen(vec2 uv){\n\
	      return (uv.x < 1.) && (uv.x > 0.) && (uv.y < 1.) && (uv.y > 0.);\n\
      }\n\
      \n\
      vec3 mod289(vec3 x) {\n\
        return x - floor(x * (1.0 / 289.0)) * 289.0;\n\
      }\n\
      \n\
      vec2 mod289(vec2 x) {\n\
        return x - floor(x * (1.0 / 289.0)) * 289.0;\n\
      }\n\
      \n\
      vec3 permute(vec3 x) {\n\
        return mod289(((x*34.0)+1.0)*x);\n\
      }\n\
      \n\
      float snoise(vec2 v)\n\
        {\n\
        const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0\n\
                            0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)\n\
                           -0.577350269189626,  // -1.0 + 2.0 * C.x\n\
                            0.024390243902439); // 1.0 / 41.0\n\
      // First corner\n\
        vec2 i  = floor(v + dot(v, C.yy) );\n\
        vec2 x0 = v -   i + dot(i, C.xx);\n\
      \n\
      // Other corners\n\
        vec2 i1;\n\
        //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0\n\
        //i1.y = 1.0 - i1.x;\n\
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);\n\
        // x0 = x0 - 0.0 + 0.0 * C.xx ;\n\
        // x1 = x0 - i1 + 1.0 * C.xx ;\n\
        // x2 = x0 - 1.0 + 2.0 * C.xx ;\n\
        vec4 x12 = x0.xyxy + C.xxzz;\n\
        x12.xy -= i1;\n\
      \n\
      // Permutations\n\
        i = mod289(i); // Avoid truncation effects in permutation\n\
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))\n\
		      + i.x + vec3(0.0, i1.x, 1.0 ));\n\
      \n\
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);\n\
        m = m*m ;\n\
        m = m*m ;\n\
      \n\
      // Gradients: 41 points uniformly over a line, mapped onto a diamond.\n\
      // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)\n\
      \n\
        vec3 x = 2.0 * fract(p * C.www) - 1.0;\n\
        vec3 h = abs(x) - 0.5;\n\
        vec3 ox = floor(x + 0.5);\n\
        vec3 a0 = x - ox;\n\
      \n\
      // Normalise gradients implicitly by scaling m\n\
      // Approximation of: m *= inversesqrt( a0*a0 + h*h );\n\
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );\n\
      \n\
      // Compute final noise value at P\n\
        vec3 g;\n\
        g.x  = a0.x  * x0.x  + h.x  * x0.y;\n\
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;\n\
        return 130.0 * dot(m, g);\n\
      }\n\
      \n\
      void main(void) {\n\
        \n\
        vec4 noise=vec4(snoise((texCoord + rnd.xy)*10.)); \n\
        noise-=vec4(0.5);\
        noise*=noise_factor; \
       \n\
        // overall plane deformation vector (zoom-in on the mouse position)\n\
        \n\
        vec2 c = vec2(0.5)+(rnd.zw-0.5)*texSize*16.0; // adding random to avoid artifacts\n\
        vec2 uv = c+(texCoord-c)*(1.0-zoom_speed); // 0.7% zoom in per frame\n\
       \n\
        // green: very soft reaction-diffusion (skin dot synthesis simulation)\n\
       \n\
        gl_FragColor.y = texture2D(texture, uv).y + noise.y*0.0066; // a dash of error diffusion;\n\
        gl_FragColor.y += (texture2D(texture, uv).y-texture2D(texture_blur4, uv).y)*0.0166; // sort of a Laplacian\n\
        \n\
        // ^^ yes, that is all the magic for green.\n\
        \n\
        // blue: just another reaction-diffusion with green as inhibitor, also different color gradients are used as plane deformation vector\n\
        \n\
        vec2 d = texSize*8.;\n\
        vec2 gy; // gradient in green\n\
        gy.x = dFdx(texture2D(texture_blur2, texCoord).y);\n\
        gy.y = dFdy(texture2D(texture_blur2, texCoord).y);\n\
        gy*=8.;\n\
      \n\
        d = texSize*4.;\n\
        vec2 gz; // gradient in blue\n\
        gz.x = dFdx(texture2D(texture_blur, texCoord).z);\n\
        gz.y = dFdy(texture2D(texture_blur, texCoord).z);\n\
        gz*=4.;\n\
      \n\
        uv += gy.yx*vec2(1.,-1.)*texSize*4. //gradient in green rotated by 90 degree\n\
          - gy*texSize*16. // gradient in green\n\
          - gz*texSize*0.25 // gradient of blue - makes the "traveling wave fronts" usually\n\
          + gz.yx*vec2(-1.,1.)*texSize*4.; // rotated gradient of blue - makes the painterly effect here\n\
        gl_FragColor.z = texture2D(texture, uv).z + noise.z*0.12; // error diffusion\n\
        gl_FragColor.z += (texture2D(texture, uv).z-texture2D(texture_blur3, uv).z)*0.11; // teh magic :P\n\
      \n\
        gl_FragColor.z +=  - (gl_FragColor.y-0.02)*.025;\n\
      \n\
        // that\'s all for blue ^^\n\
        // since this became such a beauty, the code for red is mostly a copy, but the inhibitor is inverted to the absence of green\n\
      \n\
        vec2 gx; // gradient in blue\n\
        gx.x = dFdx(texture2D(texture_blur, texCoord).x);\n\
        gx.y = dFdy(texture2D(texture_blur, texCoord).x);\n\
        gx*=4.;\n\
      \n\
        uv += - gy.yx*vec2(1.,-1.)*texSize*8. //gradient in green rotated by 90 degree\n\
          + gy*texSize*32. // gradient in green\n\
          - gx*texSize*0.25 // gradient of red - makes the "traveling wave fronts" usually\n\
          - gx.yx*vec2(-1.,1.)*texSize*4.; // rotated gradient of red - makes the painterly effect here\n\
        gl_FragColor.x = texture2D(texture, uv).x + noise.x*0.12; // error diffusion\n\
        gl_FragColor.x += (texture2D(texture, uv).x-texture2D(texture_blur3, uv).x)*0.11; // reaction diffusion\n\
      \n\
        gl_FragColor.x +=  - ((1.-gl_FragColor.y)-0.02)*.025;\n\
      \n\
        gl_FragColor.a = 1.;\n\
        gl_FragColor=clamp(gl_FragColor,-1.0,1.0); \n\
      }\n\
    ');

    var texture=this.stack_push();

    var textures=[];
    var scales=[scale1,scale2,scale3,scale4];
    for(var d=1.; !(textures[0] && textures[1] && textures[2] && textures[3] ) ; d*=Math.sqrt(2))
    {
      this.simpleShader( s_reaction_blur, { delta: [d/this.width, d/this.height]});
      
      for(var s=0; s<4; s++)
        if(!textures[s] && d>scales[s])
        {
          textures[s]=this.stack_push();          
        }
    }
    for(var s=0; s<=4; s++)
      this.stack_pop();
      
    s_reaction.textures({
        texture: texture,
        texture_blur: textures[0],
        texture_blur2: textures[1],
        texture_blur3: textures[2],
        texture_blur4: textures[3]
    });    
    
    this.simpleShader( s_reaction, {
        texSize: [1./this.width,1./this.height],
        rnd: [Math.random(),Math.random(),Math.random(),Math.random()],
        noise_factor: noise_factor,
        zoom_speed: zoom_speed
    },texture);

    return this;
}



filters.reaction2=function(F,K,D_a,D_b,iterations) {
    iterations=Math.floor(Math.min(iterations,100.));
    let s_reaction2 = this.getShader('s_reaction2',  null, '\
      uniform sampler2D texture;\n\
      uniform float F;\n\
      uniform float K;\n\
      uniform float D_a;\n\
      uniform float D_b;\n\
      uniform vec2 scale;\n\
      varying vec2 texCoord;\n\
      \n\
      void main() {\n\
	      vec2 p = texCoord.xy,\n\
	           n = p + vec2(0.0, 1.0)/scale,\n\
	           e = p + vec2(1.0, 0.0)/scale,\n\
	           s = p + vec2(0.0, -1.0)/scale,\n\
	           w = p + vec2(-1.0, 0.0)/scale;\n\
      \n\
	      vec3 color = texture2D(texture, p).xyz;\n\
	      vec2 val = color.xy,\n\
	           laplacian = texture2D(texture, n).xy\n\
		      + texture2D(texture, e).xy\n\
		      + texture2D(texture, s).xy\n\
		      + texture2D(texture, w).xy\n\
		      - 4.0 * val;\n\
      \n\
	      vec2 delta = vec2(D_a * laplacian.x - val.x*val.y*val.y + F * (1.0-val.x),\n\
		      D_b * laplacian.y + val.x*val.y*val.y - (K+F) * val.y);\n\
      \n\
	      gl_FragColor = vec4(clamp(val + delta,-1.0,1.0), color.z, 1.0);\n\
      }\n\
    ');

    this.texture.use(0);
    for(var i=0; i<iterations; i++)
      this.simpleShader( s_reaction2, {F:F,K:K,D_a:D_a,D_b:D_b, scale: [this.width,this.height] });

    return this;
}


filters.displacement=function(strength) {
    let s_displacement = this.getShader('s_displacement',  null, '\
        uniform sampler2D displacement_map;\
        uniform sampler2D texture;\
        uniform float strength;\
        varying vec2 texCoord;\
        void main() {\
            vec2 data = texture2D(displacement_map, texCoord).rg;\
            vec2 pos=texCoord + (data - vec2(0.5,0.5)) * strength; \
            gl_FragColor = texture2D(texture,pos);\
        }\
    ');

    s_displacement.textures({displacement_map: this.texture, texture: this.stack_pop()});
    this.simpleShader( s_displacement, { strength: strength });

    return this;
}


filters.address_glitch=function(mask_x,mask_y) {
    let s_address_glitch = this.getShader('s_address_glitch',  null, '\
        uniform sampler2D texture;\
        uniform float mask_x;\
        uniform float mask_y;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        int bitwise_or(int a, int b){\
          int c = 0; \
          for (int x = 0; x <= 31; ++x) {\
              c += c;\
              if (a < 0) {\
                  c += 1;\
              } else if (b < 0) {\
                  c += 1;\
              }\
              a += a;\
              b += b;\
          }\
          return c;\
        }\
        void main() {\
            ivec2 address=ivec2(texCoord*texSize+vec2(0.5001));\
            ivec2 new_address=address;\
            new_address.x=bitwise_or(address.x,int(mask_x));\
            new_address.y=bitwise_or(address.y,int(mask_y));\
            vec2 texCoord2=(vec2(new_address)-vec2(0.5))/texSize;\
            gl_FragColor = texture2D(texture,texCoord2);\
        }\
    ');


    this.simpleShader( s_address_glitch, { mask_x:mask_x, mask_y:mask_y, texSize: [this.width, this.height]});

    return this;
}


filters.gauze=function(fx,fy,angle,amplitude,x,y) {

    let s_gauze = this.getShader('s_gauze',  null, '\
        uniform sampler2D texture;\
        uniform float amplitude;\
        uniform vec4 xform;\
        uniform vec2 center;\
        varying vec2 texCoord;\
        mat2 mat=mat2(xform.xy,xform.zw);\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec2 sines=sin(mat*(texCoord-center));\
            float a=1.+amplitude*(sines.x+sines.y);\
            gl_FragColor = color*a;\
        }\
    ');

    this.simpleShader( s_gauze, {
        xform: [
           Math.cos(angle)*fx, Math.sin(angle)*fy,
          -Math.sin(angle)*fx, Math.cos(angle)*fy
        ],
        amplitude: amplitude,
        center: [x,y],
        texSize: [this.width, this.height]
    });

    return this;
}


filters.waveform=function() {
    var values=audio_engine.waveform;
    if(!values) return;
    
    // TODO using this effect seems to create TWO textures of this format. Why? Do other filters suffer this as well?
    var waveformTexture=this.getSpareTexture(null,values.length,1,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
    waveformTexture.load(values);
    this.putTexture(waveformTexture);
        
    return this;
}


filters.osciloscope=function(amplitude) {
    let s_osciloscope = this.getShader('s_osciloscope',  null, '\
      uniform sampler2D waveform;\
      uniform float amplitude; \
      varying vec2 texCoord;\
      void main() {\
        float value  = (texture2D(waveform , texCoord).r-0.5)*amplitude+0.5;\
        float a=1.0-abs(value-texCoord.y)*2.0;\
        gl_FragColor = vec4(a,a,a,1.0);\
      }\
    ');

    var values=audio_engine.waveform;
    if(!values) return;

    var waveformTexture=this.getSpareTexture(null,values.length,1,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
    waveformTexture.load(values);

    this.simpleShader( s_osciloscope, {amplitude:amplitude}, waveformTexture);
    
    this.releaseTexture(waveformTexture);

    return this;
}

filters.vectorscope=function(size,intensity,linewidth) {
    let s_vectorscope = this.getShader('s_vectorscope',  '\
    attribute vec2 _texCoord;\
    uniform sampler2D waveform;\
    uniform float size;\
    uniform float delta;\
    void main() {\
        float locX = texture2D(waveform, _texCoord).x;\
        float locY = texture2D(waveform, _texCoord+vec2(delta,0.0)).x;\
        vec4 pos=vec4(size*vec2(locX-0.5,locY-0.5),0.0,1.0);\
        gl_Position = pos;\
    }','\
    uniform float intensity;\
    void main() {\
      gl_FragColor = vec4(intensity);\
    }\
    ');
    var values=audio_engine.waveform;
    if(!values) return;
    var count=values.length;

    // generate line segments
    if(!this._.vectorscopeUVs)
    {
      this._.vectorscopeUVs=[];
      for (var t=0;t<=1.0;t+=1.0/count)
        this._.vectorscopeUVs.push(t);
      s_vectorscope.attributes({_texCoord:this._.vectorscopeUVs},{_texCoord:1});
    }
            
    // set shader parameters
    s_vectorscope.uniforms({
      size:size, delta: 20.0/count,intensity:intensity
    });    
    // set shader textures    
    let gl=this.gl;
    var waveformTexture=this.getSpareTexture(null,values.length,1,gl.LUMINANCE,gl.UNSIGNED_BYTE);
    waveformTexture.load(values);
    s_vectorscope.textures({waveform: waveformTexture});

    // render 3d mesh stored in waveform texture,uvs to texture
    this.texture.setAsTarget();
    //gl.enable(gl.DEPTH_TEST);
    ///gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
   // gl.enable(gl.LINE_SMOOTH);
    gl.lineWidth(linewidth);
    s_vectorscope.drawArrays(gl.LINE_STRIP);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);        
 
    this.releaseTexture(waveformTexture);
 
    return this;
}

filters.lumakey=filters.luma_key=function(threshold,feather) {
    let s_lumakey = this.getShader('s_lumakey',  null, '\
      uniform sampler2D texture;\
      uniform sampler2D texture1;\
      uniform float threshold;\
      uniform float feather;\
      varying vec2 texCoord;\
      void main() {\
        vec4 color  = texture2D(texture , texCoord);\
        vec4 color1 = texture2D(texture1, texCoord);\
        float luma=dot(color.rgb,vec3(1./3.)); \
        float alpha=clamp((luma - threshold) / feather, 0.0, 1.0); \
        gl_FragColor = mix(color1, color, alpha);\
      }\
    ');

    s_lumakey.textures({texture: this.texture, texture1: this.stack_pop()});
    this.simpleShader( s_lumakey, { threshold: threshold, feather: feather });

    return this;
}

filters.chroma_key_rgb=function(r,g,b,threshold,feather) {
    let s_chroma_key_rgb = this.getShader('s_chroma_key_rgb',  null, '\
      uniform sampler2D texture;\
      uniform sampler2D texture1;\
      uniform vec3 key_color;\
      uniform float threshold;\
      uniform float feather;\
      varying vec2 texCoord;\
      vec3 coeffY=vec3(0.2989,0.5866,0.1145);\
      vec2 coeff =vec2(0.7132,0.5647); \
      void main() {\
        vec4 color  = texture2D(texture , texCoord);\
        vec4 color1 = texture2D(texture1, texCoord);\
        float kY=dot(key_color,coeffY);\
        float Y =dot(color.rgb,coeffY);\
        vec2  k=coeff * (key_color.rb-vec2(kY,kY)); \
        vec2  c=coeff * (color.rb-vec2(Y,Y)); \
        float d=distance(c,k); \
        float alpha=clamp((d - threshold) / feather, 0.0, 1.0); \
        gl_FragColor = mix(color1, color, alpha);\
      }\
    ');

    s_chroma_key_rgb.textures({texture: this.texture, texture1: this.stack_pop()});
    this.simpleShader( s_chroma_key_rgb, { key_color:[r,g,b], threshold: threshold, feather: feather });

    return this;
}

filters.chroma_key=function(h,s,l,h_width,s_width,l_width,h_feather,s_feather,l_feather) {
 
    // legacy chains use chroma_key to denote chroma_key_rgb
    if(arguments.length==5) filters.chroma_key_rgb.apply(this,arguments);

    let s_chroma_key = this.getShader('s_chroma_key',  null, '\
      uniform sampler2D texture;\
      uniform sampler2D texture1;\
      uniform vec3 hsv_key;\
      uniform vec3 hsv_key_width;\
      uniform vec3 hsv_key_feather;\
      varying vec2 texCoord;\
      void main() {\
        vec4 c  = texture2D(texture , texCoord);\
        vec4 c1 = texture2D(texture1, texCoord);\
        \
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));\
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));\
        \
        float d = q.x - min(q.w, q.y);\
        float e = 1.0e-10;\
        vec3 hsv=vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);\
        \
        vec3 d_hsv=abs(hsv-hsv_key);\
        d_hsv.x=min(d_hsv.x,1.-d_hsv.x);\
        d_hsv=vec3(1.)-smoothstep(hsv_key_width,hsv_key_width+hsv_key_feather,d_hsv);\
        float delta=d_hsv.x*d_hsv.y*d_hsv.z;\
        float alpha=clamp(delta,0.0,1.0);\
        gl_FragColor = mix(c, c1, alpha);\
      }\
    ');

    h=Math.max(0.0,Math.min(1.0,h));
    s_chroma_key.textures({texture: this.texture, texture1: this.stack_pop()});
    this.simpleShader( s_chroma_key, { hsv_key:[h,s,l], hsv_key_width:[h_width,s_width,l_width],hsv_key_feather:[h_feather,s_feather,l_feather]});

    return this;
}

filters.life=function(iterations) {
    let s_life = this.getShader('s_life',  null, '\
      uniform sampler2D texture;\
      uniform vec2 texSize;\
      varying vec2 texCoord;\
\
      float cell(float x, float y){\
	      float f=dot(texture2D(texture,fract(vec2(x,y))),vec4(.33,.33,.33,0.));\
	      return floor(f+0.5);\
      }\
\
      void main(void){\
        float dx=1./texSize.x;\
        float dy=1./texSize.y;\
	      float x=texCoord.x;\
	      float y=texCoord.y;\
         float m=cell(x,y);\
         float l=cell(x-dx,y);\
         float r=cell(x+dx,y);\
         float u=cell(x,y-dy);\
         float d=cell(x,y+dy);\
         float ld=cell(x-dx,y+dy);\
         float ru=cell(x+dx,y-dy);\
         float lu=cell(x-dx,y-dy);\
         float rd=cell(x+dx,y+dy);\
	\
	      float num;\
	      num=l+r+u+d+ld+ru+lu+rd;\
	      float outp=m;\
	      if (m>0.){                \
		      if(num<2.) outp=0.;\
		      if(num>3.) outp=0.;\
	      } else if (num>2. && num<4.) outp=1.;\
         gl_FragColor = vec4(outp, outp, outp, 1.);\
      }\
    ');

    for(var i=0; i<1 || i<iterations && i<100; i++)
      this.simpleShader( s_life, {texSize: [this.width, this.height]});

    return this;
}


filters.polygon=function(sides,x,y,size,angle,aspect) {

    aspect=aspect || 1.;
    
    let s_polygon = this.getShader('s_polygon',  null, '\
        uniform sampler2D texture;\
        uniform vec2 size;\
        uniform float sides;\
        uniform float angle;\
        uniform vec2 center;\
        varying vec2 texCoord;\
        float PI=3.14159; \
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec2 uv=texCoord-vec2(0.5,0.5)-center;\
            uv/=size;\
            \
            float a=atan(uv.x,uv.y)-angle; \
            float r=length(uv); \
            \
            float d = r / (cos(PI/sides)/cos(mod(a,(2.*PI/sides))-(PI/sides))); \
            \
            if(d<1.) \
              gl_FragColor=color; \
            else \
              gl_FragColor=vec4(0.); \
        }\
    ');

    this.simpleShader( s_polygon, {
        size:[size*this.height/this.width,size*aspect],
        sides:Math.floor(sides),
        angle:angle,
        center: [x,y]
    });

    return this;
}


// TODO check wether we remiplement this by compressed textures or even an encoded video stream (WebRTC APIs or WebAsm codecs)
filters.timeshift=function(time,clear_on_switch) {
    // Store a stream of the last seconds in a ring buffer

    // calculate a sane frame limit by estimating it's memory needs.
    //
    var t=this.texture;
    // TODO this.gl.FLOAT is a wrong identifier, it is oes.HALF_FLOAT with 2 or oes.FLOAT with 4 bytes.
    var frame_bytes = t.width * t.height * 4 * (t.type==this.gl.FLOAT ? 2 : 1);
    var max_buffer_bytes=256000000;
    var max_frames=Math.floor(max_buffer_bytes / frame_bytes);

    if(!this._.pastTextures) this._.pastTextures=[];
  
    if(clear_on_switch && this.switched)
      for(key in this._.pastTextures)
        this._.pastTextures[key].clear();

    // copy current frame to the start of the queue, pushing all frames back

    var nt=null;
    if(this._.pastTextures.length>=max_frames)
      nt=this._.pastTextures.pop();
      
    nt=this.getSpareTexture(nt);
    this.texture.copyTo(nt);
    this._.pastTextures.unshift(nt);

    // copy past frame from the queue to the current texture, if available
    var j=Math.abs(Math.floor(time) % max_frames);
    if(this._.pastTextures[j]) 
    {
      this._.pastTextures[j].copyTo(this.texture);
    }

    return this;
}

filters.capture=function(source_index) {
    source_index=Math.floor(source_index);    
    var v=this.video_source(source_index,this.resolution_w,this.resolution_h);
    
    // make sure the video has adapted to the capture source
    if(!v || v.currentTime==0 || !v.videoWidth) return this; 
    
    var videoTexture=this.getSpareTexture(null,v.videoWidth, v.videoHeight);
    videoTexture.loadContentsOf(v);
    this.putTexture(videoTexture);
    
    return this;
}

filters.webrtc=function(websocket_url) {
    if(!this.webrtc_videos) {
      this.webrtc_videos={};
      this.webrtc_peers={};
    }
    if(!this.webrtc_videos[websocket_url]) {
      let v=this.webrtc_videos[websocket_url]=document.createElement('video');
      v.muted=true;
      v.autoplay=true;
      import("./webrtc.js").then(async(webrtc) => {
        this.webrtc_peers[websocket_url]=await  webrtc.WebRTC(websocket_url, null, v, null);
        v.play();
      });
    }

    let v=this.webrtc_videos[websocket_url];
    // make sure the video has adapted to the capture source
    if(!v || v.currentTime==0 || !v.videoWidth) return this;
    if(!this._.videoTexture) this._.videoTexture=this.toTexture(v);
    this._.videoTexture.loadContentsOf(v);
    this._.videoTexture.copyTo(this.texture);

    return this;
}

filters.rainbow=function(size, angle) {
    let s_rainbow = this.getShader('s_rainbow',  null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          float l=dot(rgba,vec4(1.,1.,1.,0.)/3.0); \
          vec3 hsv=vec3(l,1.,1.); \
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); \
          vec3 p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www); \
          vec3 rgb=hsv.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsv.y); \
          \
          gl_FragColor = vec4(rgb,rgba.a);\
        }\
    ');

    this.simpleShader( s_rainbow, {});

    return this;
}

/**
 * @filter         Grid
 * @description    Adds a grid to the image
 */
filters.grid=function(size, angle, x, y, width) {
    if(!width) width=0.05;
    let s_grid = this.getShader('s_grid',  null, '\
        uniform sampler2D texture;\
        uniform vec2 size;\
        uniform float angle;\
        uniform vec2 offset;\
        uniform float width;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec2 uv=(texCoord-vec2(0.5,0.5))*size;\
            uv=vec2(cos(angle)*uv.x+sin(angle)*uv.y,-sin(angle)*uv.x+cos(angle)*uv.y)+offset;\
            \
            if(fract(uv.x+width/2.)<width || fract(uv.y+width/2.)<width)\
                    gl_FragColor = vec4(0.0,0.0,0.0,1.0);\
            else\
                    gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_grid, {size: [size*10.,size/this.width*this.height*10.], angle:angle, width:width, offset:[x,y]
    });

    return this;
}

filters.absolute=function(size, angle) {
    let s_absolute = this.getShader('s_absolute',  null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          vec3 abs_rgb  = abs(rgba.rgb-vec3(0.5))*2.0; \
          gl_FragColor = vec4(abs_rgb,rgba.a);\
        }\
    ');

    this.simpleShader( s_absolute, {});

    return this;
}

/**
 * @filter         Denoise Fast
 * @description    Smooths over grainy noise in dark images using an 9x9 box filter
 *                 weighted by color intensity, similar to a bilateral filter.
 * @param exponent The exponent of the color intensity difference, should be greater
 *                 than zero. A value of zero just gives an 9x9 box blur and high values
 *                 give the original image, but ideal values are usually around 10-100.
 */
filters.denoisefast=function(exponent) {
    // Do a 3x3 bilateral box filter
    let s_denoisefast = this.getShader('s_denoisefast',  null, '\
        uniform sampler2D texture;\
        uniform float exponent;\
        uniform float strength;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        void main() {\
            vec4 center = texture2D(texture, texCoord);\
            vec4 color = vec4(0.0);\
            float total = 0.0;\
            for (float x = -1.0; x <= 1.0; x += 1.0) {\
                for (float y = -1.0; y <= 1.0; y += 1.0) {\
                    vec4 sample = texture2D(texture, texCoord + vec2(x, y) / texSize);\
                    float weight = 1.0 - abs(dot(sample.rgb - center.rgb, vec3(0.25)));\
                    weight = pow(weight, exponent);\
                    color += sample * weight;\
                    total += weight;\
                }\
            }\
            gl_FragColor = color / total;\
        }\
    ');

    // Perform five iterations for stronger results
    for (var i = 0; i < 5; i++) {
        this.simpleShader( s_denoisefast, {
            exponent: Math.max(0, exponent),
            texSize: [this.width, this.height]
        });
    }

    return this;
}

filters.spectrogram=function() {
    var values=audio_engine.spectrogram;
    if(!values) return;
    
    var spectrogramTexture=this.getSpareTexture(null,values.length,1,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
    spectrogramTexture.load(values);
    this.putTexture(spectrogramTexture);
    
    
    return this;
}

filters.smoothlife=function(birth_min,birth_max,death_min) {
    let s_smoothlife = this.getShader('s_smoothlife',  null, '\
      uniform sampler2D texture;\
      uniform vec2 texSize;\
      varying vec2 texCoord;\
      uniform float birth_min;\
      uniform float birth_max;\
      uniform float death_min;\
      \
      vec3 cell(float x, float y){\
        return texture2D(texture,vec2(x,y)).rgb;\
      }\
      \
      void main(void){\
        float dx=1./texSize.x;\
        float dy=1./texSize.y;\
        float cx=texCoord.x;\
        float cy=texCoord.y;\
        vec3 value=cell(cx,cy);\
        vec3 inner=vec3(0.),outer=vec3(0.);\
        float outer_r=4.5;\
        float split_r=3.5;\
        for(int y=-5; y<=5; y++)\
          for(int x=-5; x<=5; x++)\
          {\
            float r=length(vec2(x,y));\
            float a=smoothstep(split_r-.5,split_r+0.5,r);\
            float b=1.-smoothstep(outer_r-.5,outer_r+.5,r);\
            vec3 c=cell(cx+float(x)*dx,cy+float(y)*dy);\
            inner+=c*(1.-a);\
            outer+=c*a*b;\
          }\
        outer/=(outer_r*outer_r-split_r*split_r)*3.14159;\
        inner/=split_r*split_r*3.14159;\
        vec3 birth=smoothstep(birth_min-.05,birth_min+.05,outer)*(vec3(1.)-smoothstep(birth_max-.05,birth_max+.05,outer));\
        vec3 death=smoothstep(death_min-.05,death_min+.05,outer);\
        value=mix(birth,vec3(1.)-death,smoothstep(.45,.55,inner));\
        value=clamp(value,0.0,1.0);\
        gl_FragColor = vec4(value, 1.);\
      }\
    ');

    this.simpleShader( s_smoothlife, {
      birth_min:birth_min,
      birth_max:birth_max,
      death_min:death_min,
      texSize: [this.width, this.height]
    });

    return this;
}

filters.soft_life=function(birth_min,birth_max,death_min) {
    let s_soft_life = this.getShader('s_soft_life',  null, '\
      uniform sampler2D inner_texture;\
      uniform sampler2D outer_texture;\
      varying vec2 texCoord;\
      uniform float birth_min;\
      uniform float birth_max;\
      uniform float death_min;\
      \
      void main(void){\
        vec3 inner=texture2D(inner_texture,texCoord).rgb;\
        vec3 outer=texture2D(outer_texture,texCoord).rgb-inner;\
        vec3 birth=smoothstep(birth_min-.05,birth_min+.05,outer)*(vec3(1.)-smoothstep(birth_max-.05,birth_max+.05,outer));\
        vec3 death=smoothstep(death_min-.05,death_min+.05,outer);\
        vec3 value=mix(birth,vec3(1.)-death,smoothstep(.45,.55,inner));\
        value=clamp(value,0.0,1.0);\
        gl_FragColor = vec4(value, 1.);\
      }\
    ');

    filters.blur.call(this,5.);
    var inner_texture=this.stack_push();
    filters.blur.call(this,10.);

    this.stack_pop();
        
    s_soft_life.textures({inner_texture: inner_texture, outer_texture: this.texture});
    
    this.simpleShader( s_soft_life, {
      birth_min:birth_min,
      birth_max:birth_max,
      death_min:death_min,
    });

    return this;
}


filters.particles=function(anglex,angley,anglez,size,strength,homing,noise,displacement) {
    let s_particles = this.getShader('s_particles',  '\
    attribute vec2 _texCoord;\
    uniform sampler2D texture;\
    uniform mat4 matrix;\
    uniform sampler2D particles;\
    uniform float strength;\
    uniform float size;\
    varying vec4 rgba;\
    void main() {\
        vec3 loc = texture2D(particles, _texCoord).xyz-0.5;\
        loc=mix(vec3(_texCoord,0.0),loc,strength);\
        vec4 pos=matrix * vec4(loc,1.0);\
        gl_Position = pos/pos.w;\
        gl_PointSize=size/pos.w;\
        rgba = texture2D(texture, _texCoord);\
    }','\
    varying vec4 rgba;\
    void main() {\
      vec2 uv=gl_PointCoord;\
      float d=2.*max(0.,0.5-length(uv-vec2(0.5)));\
      gl_FragColor = rgba*2.*d;\
      if(rgba.a*d<.1) discard; \
    }\
    ');

    let s_particle_update = this.getShader('s_particle_update',  null,'\
        uniform sampler2D texture;\
        uniform sampler2D displacement_texture;\
        uniform float homing; \
        uniform float noise; \
        uniform float displacement; \
        varying vec2 texCoord;\
        vec3 noise3(vec3 t){\
          vec3 dots=vec3(\
            dot(t.xy ,vec2(12.9898,78.233)),\
            dot(t.yz ,vec2(12.9898,78.233)),\
            dot(t.zx ,vec2(12.9898,78.233))\
          );\
          return fract(sin(dots) * 43758.5453);\
        }\
        void main() {\
            vec3 pos = texture2D(texture, texCoord).xyz-0.5;\
            vec3 disp = texture2D(displacement_texture, texCoord).xyz-0.5;\
            vec3 home=vec3(texCoord,0.0);\
            vec3 uvw=(pos+disp)+home;\
            vec3 n=noise3(uvw)-0.5;\
            pos+=noise*n/100.;\
            pos=mix(pos,home,homing);\
            pos+=displacement*disp;\
            gl_FragColor = vec4(pos+0.5,1.0);\
        }\
    ');

    // generate grid mesh and particle data textures
    var w=320, h=240;
    if(!this._.particleUvs)
    {
      this._.particleUvs=[];
      var dx=1./w;
      var dy=1./h;
      for (var y=0;y<=1.0;y+=dy) {
          for (var x=0;x<=1.0;x+=dx) {        
              this._.particleUvs.push(x,y);
          }
      }
      s_particles.attributes({_texCoord:this._.particleUvs},{_texCoord:2});
      
      // generate particle data double buffer
      if(!this._.particleTextureA) {
        var type;
        var oes=this.gl.getExtension( 'OES_texture_float' );
        if (!oes) {
          console.log('particle effect recommends gl.FLOAT textures, falling back to gl.BYTE');
          type=this.gl.UNSIGNED_BYTE;
        }else
          type=oes.FLOAT;
        this._.particleTextureA=this.getSpareTexture(null, w,h, this.gl.RGBA, type);
        this._.particleTextureB=this.getSpareTexture(null, w,h, this.gl.RGBA, type);
      }
    }
   
    [this._.particleTextureB,this._.particleTextureA]=[this._.particleTextureA,this._.particleTextureB];

    s_particle_update.uniforms({
      homing:homing,
      noise:noise,
      displacement:displacement
    });             
    var texture=this.stack_pop();
    s_particle_update.textures({displacement_texture: texture, texture: this._.particleTextureB});
        
    this._.particleTextureA.setAsTarget();
    s_particle_update.drawRect();

    // perspective projection matrix
    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);
    // camera placement transformation matrix
    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-2.]);
    mat4.rotate(matrix,anglex,[1.0,0.0,0.0]);
    mat4.rotate(matrix,angley,[0.0,1.0,0.0]);
    mat4.rotate(matrix,anglez,[0.0,0.0,1.0]);
    mat4.translate(matrix,[-1.,-1.,0]);
    mat4.scale(matrix,[2.0,2.0,2.0]);
    mat4.multiply(proj,matrix,matrix);
    
        
    // set shader parameters
    s_particles.uniforms({
      matrix:matrix,
      strength:strength,
      size:size
    });
    
    // set shader textures    
    s_particles.textures({particles: this._.particleTextureA, texture: this.texture});

    // render 3d mesh stored in vertices,uvs to spare texture
    var target=this.getSpareTexture()
    target.setAsTarget();
    let gl=this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    s_particles.drawArrays(gl.POINTS);
    gl.disable(gl.DEPTH_TEST);
    // replace current texture by spare texture
    this.putTexture(target);
 
    return this;
}

filters.stack_push=function(from_texture) {
  this.stack_push(from_texture);
}

filters.stack_swap=function() {
  // exchange topmost stack element with current texture
  if(this.stack.length<1) return;
  
  var tmp=this.texture;
  this.texture=this.stack[this.stack.length-1];
  this.stack[this.stack.length-1]=tmp;
}

filters.patch_displacement=function(sx,sy,sz,anglex,angley,anglez,scale,pixelate) {
    let s_patch_displacement = this.getShader('s_patch_displacement',  '\
    attribute vec3 vertex;\
    attribute vec2 _texCoord;\
    varying vec2 texCoord;\
    uniform mat4 matrix;\
    uniform sampler2D displacement_map;\
    uniform vec3 strength;\
    uniform float scale;\
    uniform float pixelate;\
    void main() {\
        texCoord = mix(vertex.xy,_texCoord,pixelate)*scale;\
        vec3 dis = texture2D(displacement_map, _texCoord).xyz-0.5;\
        vec4 pos=matrix * (vec4((vertex+dis*strength)*scale,1.0));\
        gl_Position = pos/pos.w;\
    }');

    // generate grid mesh
    if(!this._.gridPatchesVertices)
    {
      this._.gridPatchesVertices=[];
      this._.gridPatchesUvs=[];
      var dx=1./160.;
      var dy=1./100.;
      for (var y=0;y<=1.0;y+=dy) {
          for (var x=0;x<=1.0;x+=dx) {        
              this._.gridPatchesVertices.push(x,y,0);
              this._.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this._.gridPatchesVertices.push(x,y+dy,0);
              this._.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this._.gridPatchesVertices.push(x+dx,y+dy,0);
              this._.gridPatchesUvs.push(x+dx/2,y+dy/2);

              this._.gridPatchesVertices.push(x,y,0);
              this._.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this._.gridPatchesVertices.push(x+dx,y+dy,0);
              this._.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this._.gridPatchesVertices.push(x+dx,y,0);
              this._.gridPatchesUvs.push(x+dx/2,y+dy/2);
          }
      }
      s_patch_displacement.attributes({vertex: this._.gridPatchesVertices,_texCoord:this._.gridPatchesUvs},{vertex: 3, _texCoord:2});
    }

    // perspective projection matrix
    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);
    // camera placement transformation matrix
    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-2.]);
    mat4.rotate(matrix,anglex,[1.0,0.0,0.0]);
    mat4.rotate(matrix,angley,[0.0,1.0,0.0]);
    mat4.rotate(matrix,anglez,[0.0,0.0,1.0]);
    mat4.translate(matrix,[-1.,-1.,0]);
    mat4.scale(matrix,[2.0,2.0,2.0]);
    mat4.multiply(proj,matrix,matrix);
    
    // set shader parameters
    s_patch_displacement.uniforms({
      matrix:matrix,
      strength: [sx,sy,sz],
      scale: scale,
      pixelate:pixelate
    });
    
    // set shader textures
    s_patch_displacement.textures({displacement_map: this.texture, texture: this.stack_pop()});

    // render 3d mesh stored in vertices,uvs to spare texture
    var target=this.getSpareTexture();
    target.setAsTarget();
    let gl=this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    s_patch_displacement.drawArrays(gl.TRIANGLES);
    gl.disable(gl.DEPTH_TEST);

    this.putTexture(target);
 
    return this;
}

/**
 * @filter       Perspective
 * @description  Warps one quadrangle to another with a perspective transform. This can be used to
 *               make a 2D image look 3D or to recover a 2D image captured in a 3D environment.
 * @param before The x and y coordinates of four points before the transform in a flat list. This
 *               would look like [ax, ay, bx, by, cx, cy, dx, dy] for four points (ax, ay), (bx, by),
 *               (cx, cy), and (dx, dy).
 * @param after  The x and y coordinates of four points after the transform in a flat list, just
 *               like the other argument.
 */
filters.perspective=function(before, after) {
    function getSquareToQuad(x0, y0, x1, y1, x2, y2, x3, y3) {
        var dx1 = x1 - x2;
        var dy1 = y1 - y2;
        var dx2 = x3 - x2;
        var dy2 = y3 - y2;
        var dx3 = x0 - x1 + x2 - x3;
        var dy3 = y0 - y1 + y2 - y3;
        var det = dx1*dy2 - dx2*dy1;
        var a = (dx3*dy2 - dx2*dy3) / det;
        var b = (dx1*dy3 - dx3*dy1) / det;
        return [
            x1 - x0 + a*x1, y1 - y0 + a*y1, a, 0,
            x3 - x0 + b*x3, y3 - y0 + b*y3, b, 0,
            x0, y0, 1 , 0,
            0,0,0,1
        ];
    }

    var a = getSquareToQuad.apply(null, after);
    var b = getSquareToQuad.apply(null, before);
    var c = mat4.multiply( b,mat4.inverse(a));
    var d = mat4.toMat3(c);
    return filters.matrixWarp.call(this,d,false);
}

/**
 * @filter                Matrix Warp
 * @description           Transforms an image by a 2x2 or 3x3 matrix. The coordinates used in
 *                        the transformation are (x, y) for a 2x2 matrix or (x, y, 1) for a
 *                        3x3 matrix, where x and y are in units of pixels.
 * @param matrix          A 2x2 or 3x3 matrix represented as either a list or a list of lists.
 *                        For example, the 3x3 matrix [[2,0,0],[0,3,0],[0,0,1]] can also be
 *                        represented as [2,0,0,0,3,0,0,0,1] or just [2,0,0,3].
 * @param inverse         A boolean value that, when true, applies the inverse transformation
 *                        instead. (optional, defaults to false)
 * @param useTextureSpace A boolean value that, when true, uses texture-space coordinates
 *                        instead of screen-space coordinates. Texture-space coordinates range
 *                        from -1 to 1 instead of 0 to width - 1 or height - 1, and are easier
 *                        to use for simple operations like flipping and rotating.
 */
filters.matrixWarp=function(matrix, inverse) {
    let s_matrixWarp = warpShader(this, 's_matrixWarp', '\
        uniform mat3 matrix;\
    ', '\
        vec3 warp = matrix * vec3(coord, 1.0);\
        coord = warp.xy / warp.z;\
    ');

    this.simpleShader( s_matrixWarp, {
        matrix: inverse ? getInverse(matrix) : matrix
    });

    return this;
}

/**
 * @filter        Swirl
 * @description   Warps a circular region of the image in a swirl.
 * @param centerX The x coordinate of the center of the circular region.
 * @param centerY The y coordinate of the center of the circular region.
 * @param radius  The radius of the circular region.
 * @param angle   The angle in radians that the pixels in the center of
 *                the circular region will be rotated by.
 */
filters.swirl=function(centerX, centerY, radius, angle) {
    let s_swirl = warpShader(this, 's_swirl', '\
        uniform float radius;\
        uniform float angle;\
        uniform vec2 center;\
    ', '\
        coord -= center;\
        float distance = length(coord);\
        if (distance < radius) {\
            float percent = (radius - distance) / radius;\
            float theta = percent * percent * angle;\
            float s = sin(theta);\
            float c = cos(theta);\
            coord = vec2(\
                coord.x * c - coord.y * s,\
                coord.x * s + coord.y * c\
            );\
        }\
        coord += center;\
    ');

    this.simpleShader( s_swirl, {
        radius: radius,
        center: [centerX, centerY],
        angle: angle
    });

    return this;
}

/**
 * @filter         Bulge / Pinch
 * @description    Bulges or pinches the image in a circle.
 * @param centerX  The x coordinate of the center of the circle of effect.
 * @param centerY  The y coordinate of the center of the circle of effect.
 * @param radius   The radius of the circle of effect.
 * @param strength -1 to 1 (-1 is strong pinch, 0 is no effect, 1 is strong bulge)
 */
filters.bulgePinch=function(centerX, centerY, radius, strength) {
    let s_bulgePinch = warpShader(this, 's_bulgePinch', '\
        uniform float radius;\
        uniform float strength;\
        uniform vec2 center;\
    ', '\
        coord -= center;\
        float distance = length(coord);\
        if (distance < radius) {\
            float percent = distance / radius;\
            if (strength > 0.0) {\
                coord *= mix(1.0, smoothstep(0.0, radius / distance, percent), strength * 0.75);\
            } else {\
                coord *= mix(1.0, pow(percent, 1.0 + strength * 0.75) * radius / distance, 1.0 - percent);\
            }\
        }\
        coord += center;\
    ');

    this.simpleShader( s_bulgePinch, {
        radius: radius,
        strength: clamp(-1, strength, 1),
        center: [centerX, centerY]
    });

    return this;
}

/**
 * @filter         Zoom Blur
 * @description    Blurs the image away from a certain point, which looks like radial motion blur.
 * @param centerX  The x coordinate of the blur origin.
 * @param centerY  The y coordinate of the blur origin.
 * @param strength The strength of the blur. Values in the range 0 to 1 are usually sufficient,
 *                 where 0 doesn't change the image and 1 creates a highly blurred image.
 */
filters.zoomBlur=function(centerX, centerY, strength) {
    let s_zoomBlur = this.getShader('s_zoomBlur',  null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
        uniform float strength;\
        varying vec2 texCoord;\
        ' + randomShaderFunc + '\
        void main() {\
            vec4 color = vec4(0.0);\
            float total = 0.0;\
            \
            /* randomize the lookup values to hide the fixed number of samples */\
            float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);\
            \
            for (float t = 0.0; t <= 40.0; t++) {\
                float percent = (t + offset) / 40.0;\
                float weight = 4.0 * (percent - percent * percent);\
                vec4 sample = texture2D(texture, (texCoord - center) * (1. - percent * strength) + center );\
                \
                /* switch to pre-multiplied alpha to correctly blur transparent images */\
                sample.rgb *= sample.a;\
                \
                color += sample * weight;\
                total += weight;\
            }\
            \
            gl_FragColor = color / total;\
            \
            /* switch back from pre-multiplied alpha */\
            gl_FragColor.rgb /= gl_FragColor.a + 0.00001;\
        }\
    ');

    this.simpleShader( s_zoomBlur, {
        center: [centerX+0.5, centerY+0.5],
        strength: strength
    });

    return this;
}

filters.dilate=function(iterations) {
    let s_dilate = this.getShader('s_dilate',  null, '\
        uniform sampler2D texture;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        void main() \
        {\
          vec4 col = vec4(0.,0.,0.,1.);\
          for(int xoffset = -1; xoffset <= 1; xoffset++)\
          {\
	          for(int yoffset = -1; yoffset <= 1; yoffset++)\
	          {\
		          vec2 offset = vec2(xoffset,yoffset);\
		          col = max(col,texture2D(texture,texCoord+offset/texSize));\
	          }\
          }\
          gl_FragColor = clamp(col,vec4(0.),vec4(1.));\
        }\
    ');

    for(var i=0; i<iterations; i++)
      this.simpleShader( s_dilate, {texSize: [this.width, this.height]});

    return this;
}

/**
 * @filter       Fast Blur
 * @description  This is the most basic blur filter, which convolves the image with a
 *               pyramid filter. The pyramid filter is separable and is applied as two
 *               perpendicular triangle filters.
 * @param radius The radius of the pyramid convolved with the image.
 */
filters.localContrast=function(radius,strength) {
    let s_localContrastMin = this.getShader('s_localContrastMin',  null, '\
        uniform sampler2D texture;\
        uniform vec2 delta;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = vec4(1.0);\
            color=min(color,texture2D(texture, texCoord         ));\
            color=min(color,texture2D(texture, texCoord + delta * vec2( 1.,0.) ));\
            color=min(color,texture2D(texture, texCoord + delta * vec2(-1.,0.) ));\
            color=min(color,texture2D(texture, texCoord + delta * vec2(0., 1.) ));\
            color=min(color,texture2D(texture, texCoord + delta * vec2(0.,-1.) ));\
            gl_FragColor = color; \
        }\
    ');
    let s_localContrastMax = this.getShader('s_localContrastMax',  null, '\
        uniform sampler2D texture;\
        uniform vec2 delta;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = vec4(0.0);\
            color=max(color,texture2D(texture, texCoord         ));\
            color=max(color,texture2D(texture, texCoord + delta * vec2( 1.,0.) ));\
            color=max(color,texture2D(texture, texCoord + delta * vec2(-1.,0.) ));\
            color=max(color,texture2D(texture, texCoord + delta * vec2(0., 1.) ));\
            color=max(color,texture2D(texture, texCoord + delta * vec2(0.,-1.) ));\
            gl_FragColor = color; \
        }\
    ');
    let s_localContrast = this.getShader('s_localContrast',  null, '\
        uniform sampler2D texture;\
        uniform sampler2D min_texture;\
        uniform sampler2D max_texture;\
        uniform float strength; \
        varying vec2 texCoord;\
        void main() {\
            vec3 color    =texture2D(texture    ,texCoord).rgb; \
            vec3 min_color=texture2D(min_texture,texCoord).rgb; \
            vec3 max_color=texture2D(max_texture,texCoord).rgb; \
            vec3 contrast_color=(color-min_color)/(max_color-min_color);\
            gl_FragColor = vec4(mix(color,contrast_color,strength),1.); \
        }\
    ');


    // save current image to stack
    var original_image=this.stack_push();
    
    filters.blur.call(this,radius);    
    var min_image=this.stack_push();
    var max_image=this.stack_push();

    var steps=radius/2;
    var delta=Math.sqrt(radius);

    for(var i=0; i<steps; i++)
      this.simpleShader( s_localContrastMin, { delta: [delta/this.width, delta/this.height]}, min_image, min_image);

    for(var i=0; i<steps; i++)
      this.simpleShader( s_localContrastMax, { delta: [delta/this.width, delta/this.height]},max_image, max_image);

  
    s_localContrast.textures({min_texture:min_image, max_texture:max_image});
    this.simpleShader( s_localContrast, {strength:strength},original_image);
    
    this.stack_pop();
    this.stack_pop();    
    this.stack_pop();
  
    return this;
}


filters.erode=function(iterations) {
    let s_erode = this.getShader('s_erode',  null, '\
        uniform sampler2D texture;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        void main() \
        {\
          vec4 col = vec4(1);\
          for(int xoffset = -1; xoffset <= 1; xoffset++)\
          {\
	          for(int yoffset = -1; yoffset <= 1; yoffset++)\
	          {\
		          vec2 offset = vec2(xoffset,yoffset);\
		          col = min(col,texture2D(texture,texCoord+offset/texSize));\
	          }\
          }\
          gl_FragColor = clamp(col,vec4(0.),vec4(1.));\
        }\
    ');

    for(var i=0; i<iterations; i++)
      this.simpleShader( s_erode, {texSize: [this.width, this.height]});

    return this;
}

filters.fastBlur=filters.blur=function(radius) {
    let s_blur = this.getShader('s_blur',  null, '\
        uniform sampler2D texture;\
        uniform vec2 delta;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = vec4(0.0);\
            float b=1./4.;\
            color+=b*texture2D(texture, texCoord + delta * vec2( .5, .5) );\
            color+=b*texture2D(texture, texCoord + delta * vec2(-.5, .5) );\
            color+=b*texture2D(texture, texCoord + delta * vec2( .5,-.5) );\
            color+=b*texture2D(texture, texCoord + delta * vec2(-.5,-.5) );\
            gl_FragColor = color; \
        }\
    ');

    for(var d=1.; d<=radius; d*=Math.sqrt(2))
    {
      this.simpleShader( s_blur, { delta: [d/this.width, d/this.height]});
    }
    return this;
}

filters.blur_alpha=function(radius) {
    let s_blur_alpha = this.getShader('s_blur_alpha',  null, '\
        uniform sampler2D texture;\
        uniform vec2 delta;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            float b=1./4.;\
            float alpha=0.0;\
            alpha+=b*texture2D(texture, texCoord + delta * vec2( .5, .5) ).a;\
            alpha+=b*texture2D(texture, texCoord + delta * vec2(-.5, .5) ).a;\
            alpha+=b*texture2D(texture, texCoord + delta * vec2( .5,-.5) ).a;\
            alpha+=b*texture2D(texture, texCoord + delta * vec2(-.5,-.5) ).a;\
            gl_FragColor = vec4(color.rgb, alpha); \
        }\
    ');

    let s_blur_alpha_post = this.getShader('s_blur_alpha_post', null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = vec4(color.rgb, 2.*color.a-1.); \
        }\
    ');

    for(var d=1.; d<=radius; d*=Math.sqrt(2.))
    {
      this.simpleShader( s_blur_alpha, { delta: [d/this.width, d/this.height]});
    }
    this.simpleShader(s_blur_alpha_post);
    return this;
}



filters.blur2=function(radius,exponent) {
    let s_blur2 = this.getShader('s_blur2',  null, '\
        uniform sampler2D texture;\
        uniform vec2 delta;\
        uniform float exponent;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = vec4(0.0);\
            float b=1./4.;\
            vec4 e=vec4(exponent);\
            color+=b*pow(texture2D(texture, texCoord + delta * vec2( .5, .5) ), e);\
            color+=b*pow(texture2D(texture, texCoord + delta * vec2(-.5, .5) ), e);\
            color+=b*pow(texture2D(texture, texCoord + delta * vec2( .5,-.5) ), e);\
            color+=b*pow(texture2D(texture, texCoord + delta * vec2(-.5,-.5) ), e);\
            gl_FragColor = pow(color,1./e); \
        }\
    ');

    for(var d=1.; d<=radius; d*=Math.sqrt(2))
    {
      this.simpleShader( s_blur2, { exponent: exponent, delta: [d/this.width, d/this.height]});
    }
    return this;
}


/**
 * @filter         Unsharp Mask
 * @description    A form of image sharpening that amplifies high-frequencies in the image. It
 *                 is implemented by scaling pixels away from the average of their neighbors.
 * @param radius   The blur radius that calculates the average of the neighboring pixels.
 * @param strength A scale factor where 0 is no effect and higher values cause a stronger effect.
 */
filters.unsharpMask=function(radius, strength) {
    let s_unsharpMask = this.getShader('s_unsharpMask',  null, '\
        uniform sampler2D blurredTexture;\
        uniform sampler2D originalTexture;\
        uniform float strength;\
        uniform float threshold;\
        varying vec2 texCoord;\
        void main() {\
            vec4 blurred = texture2D(blurredTexture, texCoord);\
            vec4 original = texture2D(originalTexture, texCoord);\
            gl_FragColor = mix(blurred, original, 1.0 + strength);\
        }\
    ');

    // Store a copy of the current texture in the second texture unit
    this.texture.copyTo(this._.extraTexture);

    // Blur the current texture, then use the stored texture to detect edges
    filters.blur.call(this,radius);
    s_unsharpMask.textures({
        blurredTexture: this.texture,
        originalTexture: this._.extraTexture
    });
    this.simpleShader( s_unsharpMask, {
        strength: strength
    });

    return this;
}

/**
 * @filter           Color
 * @description      Give more or less importance to a color
 * @param alpha      0 to 1 Importance of the color modification
 * @param r          0 to 1 Importance of the Red Chanel modification
 * @param g          0 to 1 Importance of the Green Chanel modification
 * @param b          0 to 1 Importance of the Blue Chanel modification
 */
filters.color=function(alpha,r,g,b) {
    let s_color = this.getShader('s_color',  null, '\
        uniform sampler2D texture;\
        uniform float r;\
        uniform float g;\
        uniform float b;\
        uniform float a;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            color.r += r * a;\
            color.g += g * a;\
            color.b += b * a;\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_color, {
       r  : r,
       g  : g,
       b  : b,
       a  : alpha
    });

    return this;
}
/**
 * @filter         Denoise
 * @description    Smooths over grainy noise in dark images using an 9x9 box filter
 *                 weighted by color intensity, similar to a bilateral filter.
 * @param exponent The exponent of the color intensity difference, should be greater
 *                 than zero. A value of zero just gives an 9x9 box blur and high values
 *                 give the original image, but ideal values are usually around 10-20.
 */
filters.denoise=function(exponent) {
    // Do a 9x9 bilateral box filter
    let s_denoise = this.getShader('s_denoise',  null, '\
        uniform sampler2D texture;\
        uniform float exponent;\
        uniform float strength;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        void main() {\
            vec4 center = texture2D(texture, texCoord);\
            vec4 color = vec4(0.0);\
            float total = 0.0;\
            for (float x = -4.0; x <= 4.0; x += 1.0) {\
                for (float y = -4.0; y <= 4.0; y += 1.0) {\
                    vec4 sample = texture2D(texture, texCoord + vec2(x, y) / texSize);\
                    float weight = 1.0 - abs(dot(sample.rgb - center.rgb, vec3(0.25)));\
                    weight = pow(weight, exponent);\
                    color += sample * weight;\
                    total += weight;\
                }\
            }\
            gl_FragColor = color / total;\
        }\
    ');

    // Perform two iterations for stronger results
    for (var i = 0; i < 2; i++) {
        this.simpleShader( s_denoise, {
            exponent: Math.max(0, exponent),
            texSize: [this.width, this.height]
        });
    }

    return this;
}



/**
 * @filter       Vibrance
 * @description  Modifies the saturation of desaturated colors, leaving saturated colors unmodified.
 * @param amount -1 to 1 (-1 is minimum vibrance, 0 is no change, and 1 is maximum vibrance)
 */
filters.vibrance=function(amount) {
    let s_vibrance = this.getShader('s_vibrance',  null, '\
        uniform sampler2D texture;\
        uniform float amount;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            float average = (color.r + color.g + color.b) / 3.0;\
            float mx = max(color.r, max(color.g, color.b));\
            float amt = (mx - average) * (-amount * 3.0);\
            color.rgb = mix(color.rgb, vec3(mx), amt);\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_vibrance, {
        amount: clamp(-1, amount, 1)
    });

    return this;
}

// min:0.0,gamma:1.0,max:1.0, r_min:0.0,g_min:0.0,b_min:0.0, r_gamma:1.0,g_gamma:1.0,b_gamma:1.0, r_max:1.0,g_max:1.0,b_max:1.0
filters.levels=function(min,gamma,max, r_min,g_min,b_min, r_gamma,g_gamma,b_gamma, r_max,g_max,b_max) {
    let s_levels = this.getShader('s_levels',  null, '\
        varying vec2 texCoord;\
        uniform sampler2D texture;\
        uniform vec3 rgb_min; \
        uniform vec3 rgb_gamma; \
        uniform vec3 rgb_max; \
        void main()\
        {\
            vec4 color = texture2D(texture, texCoord);\
            color.rgb-=rgb_min;\
            color.rgb/=(rgb_max-rgb_min);\
            color.rgb=clamp(color.rgb,0.0,1.0);\
            color.rgb = pow(color.rgb, rgb_gamma);\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_levels, {
        rgb_min:[r_min+min,g_min+min,b_min+min],
        rgb_gamma:[r_gamma*gamma,g_gamma*gamma,b_gamma*gamma],
        rgb_max:[r_max+max-1.,g_max+max-1.,b_max+max-1.]
    });

    return this;
}

/**
 * @filter           Hue / Saturation
 * @description      Provides rotational hue and multiplicative saturation control. RGB color space
 *                   can be imagined as a cube where the axes are the red, green, and blue color
 *                   values. Hue changing works by rotating the color vector around the grayscale
 *                   line, which is the straight line from black (0, 0, 0) to white (1, 1, 1).
 *                   Saturation is implemented by scaling all color channel values either toward
 *                   or away from the average color channel value.
 * @param hue        -1 to 1 (-1 is 180 degree rotation in the negative direction, 0 is no change,
 *                   and 1 is 180 degree rotation in the positive direction)
 * @param saturation -1 to 1 (-1 is solid gray, 0 is no change, and 1 is maximum contrast)
 */
filters.hueSaturation=function(hue, saturation) {
    let s_hueSaturation = this.getShader('s_hueSaturation',  null, '\
        uniform sampler2D texture;\
        uniform float hue;\
        uniform float saturation;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            \
            /* hue adjustment, wolfram alpha: RotationTransform[angle, {1, 1, 1}][{x, y, z}] */\
            float angle = hue * 3.14159265;\
            float s = sin(angle), c = cos(angle);\
            vec3 weights = (vec3(2.0 * c, -sqrt(3.0) * s - c, sqrt(3.0) * s - c) + 1.0) / 3.0;\
            float len = length(color.rgb);\
            color.rgb = vec3(\
                dot(color.rgb, weights.xyz),\
                dot(color.rgb, weights.zxy),\
                dot(color.rgb, weights.yzx)\
            );\
            \
            /* saturation adjustment */\
            float average = (color.r + color.g + color.b) / 3.0;\
            if (saturation > 0.0) {\
                color.rgb += (average - color.rgb) * (1.0 - 1.0 / (1.001 - saturation));\
            } else {\
                color.rgb += (average - color.rgb) * (-saturation);\
            }\
            \
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_hueSaturation, {
        hue: clamp(-1, hue, 1),
        saturation: clamp(-1, saturation, 1)
    });

    return this;
}

/**
 * @filter           Brightness / Contrast
 * @description      Provides additive brightness and multiplicative contrast control.
 * @param brightness -1 to 1 (-1 is solid black, 0 is no change, and 1 is solid white)
 * @param contrast   -1 to 1 (-1 is solid gray, 0 is no change, and 1 is maximum contrast)
 */
filters.brightnessContrast=function(brightness, contrast) {
    let s_brightnessContrast = this.getShader('s_brightnessContrast',  null, '\
        uniform sampler2D texture;\
        uniform float brightness;\
        uniform float contrast;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            color.rgb += brightness;\
            if (contrast > 0.0) {\
                color.rgb = (color.rgb - 0.5) / (1.0 - contrast) + 0.5;\
            } else {\
                color.rgb = (color.rgb - 0.5) * (1.0 + contrast) + 0.5;\
            }\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_brightnessContrast, {
        brightness: clamp(-1, brightness, 1),
        contrast: clamp(-1, contrast, 1)
    });

    return this;
}

filters.contrast_s=function(contrast) {
    let s_contrast_s = this.getShader('s_contrast_s',  null, '\
        uniform sampler2D texture;\
        uniform float contrast;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec3 x=(color.rgb-0.5)*2.0;\
            vec3 xa=abs(x);\
            vec3 f=(contrast*xa-xa) / (2.0*contrast*xa - contrast - 1.0);\
            color.rgb=(sign(x)*f+1.0)/2.0;\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_contrast_s, {
        contrast: -clamp(contrast,-1,1)
    });

    return this;
}
filters.threshold=function(threshold,feather,r0,g0,b0,r1,g1,b1) {
    let s_threshold = this.getShader('s_threshold',  null, '\
        uniform sampler2D texture;\
        uniform float threshold;\
        uniform float feather;\
        uniform vec3 c0;\
        uniform vec3 c1;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            color.rgb=mix(c0,c1,clamp((length(color.rgb)-threshold)/feather,0.0,1.0));\
            gl_FragColor = color;\
        }\
    ');
    
    this.simpleShader( s_threshold, {threshold:threshold,feather:feather,c0:[r0,g0,b0],c1:[r1,g1,b1]});

    return this;
}


/**
 * @description Sobel implementation of image with alpha and line color control
 * @param secondary (0 to 1), indice of sobel strength
 * @param coef (0 to 1), indice of sobel strength coeficient
 * @param alpha (0 to 1) how strong is the sobel result draw in top of image. (0 image is unchanged, 1 image is replace by sobel representation)
 * @param r (0 to 1) R chanel color of the sobel line
 * @param g (0 to 1) G chanel color of the sobel line
 * @param b (0 to 1) B chanel color of the sobel line
 * @param a (0 to 1) alpha chanel color of the sobel line
 * @param r2 (0 to 1) R chanel color of the sobel area
 * @param g2 (0 to 1) G chanel color of the sobel area
 * @param b2 (0 to 1) B chanel color of the sobel area
 * @param a2 (0 to 1) alpha chanel color of the sobel area
 */

filters.sobel=function(secondary, coef, alpha, r,g,b,a, r2,g2,b2, a2) {
    let s_sobel = this.getShader('s_sobel',  null, '\
        uniform sampler2D texture;\
        uniform float alpha;\
        uniform float r;\
        uniform float g;\
        uniform float b;\
        uniform float r2;\
        uniform float g2;\
        uniform float b2;\
        uniform float a2;\
        uniform float a;\
        uniform float secondary;\
        uniform float coef;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            float bottomLeftIntensity = texture2D(texture, texCoord + vec2(-0.0015625, 0.0020833)).r;\
            float topRightIntensity = texture2D(texture, texCoord + vec2(0.0015625, -0.0020833)).r;\
            float topLeftIntensity = texture2D(texture, texCoord + vec2(-0.0015625, 0.0020833)).r;\
            float bottomRightIntensity = texture2D(texture, texCoord + vec2(0.0015625, 0.0020833)).r;\
            float leftIntensity = texture2D(texture, texCoord + vec2(-0.0015625, 0)).r;\
            float rightIntensity = texture2D(texture, texCoord + vec2(0.0015625, 0)).r;\
            float bottomIntensity = texture2D(texture, texCoord + vec2(0, 0.0020833)).r;\
            float topIntensity = texture2D(texture, texCoord + vec2(0, -0.0020833)).r;\
            float h = -secondary * topLeftIntensity - coef * topIntensity - secondary * topRightIntensity + secondary * bottomLeftIntensity + coef * bottomIntensity + secondary * bottomRightIntensity;\
            float v = -secondary * bottomLeftIntensity - coef * leftIntensity - secondary * topLeftIntensity + secondary * bottomRightIntensity + coef * rightIntensity + secondary * topRightIntensity;\
\
            float mag = length(vec2(h, v));\
            if (mag < 0.5) {\
                float al = alpha * a;\
                color.rgb *= (1.0 - al);\
                color.r += r * al;\
                color.g += g * al;\
                color.b += b * al;\
                color.rgb += al * mag;\
            } else { \
                float al = alpha * a2;\
                color.rgb *= (1.0 - al);\
                color.r += r2 * al;\
                color.g += g2 * al;\
                color.b += b2 * al;\
                color.rgb += al * mag;\
            }\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_sobel, {
        secondary : secondary,
        coef : coef,
        alpha : alpha,
        r : r,
        g : g,
        b : b,
        a : a,
        r2 : r2,
        g2 : g2,
        b2 : b2,
        a2: a2
    });

    return this;
}

filters.sobel_rgb=function(secondary, coef, smoothness, alpha, r,g,b, r2,g2,b2) {
    let s_sobel_rgb = this.getShader('s_sobel_rgb',  null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        uniform float alpha;\
        uniform vec3 c_edge;\
        uniform vec3 c_area;\
        uniform float secondary;\
        uniform float coef;\
        uniform float smoothness;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec3 bottomLeftIntensity = texture2D(texture, texCoord + vec2(-0.0015625, 0.0020833)).rgb;\
            vec3 topRightIntensity = texture2D(texture, texCoord + vec2(0.0015625, -0.0020833)).rgb;\
            vec3 topLeftIntensity = texture2D(texture, texCoord + vec2(-0.0015625, 0.0020833)).rgb;\
            vec3 bottomRightIntensity = texture2D(texture, texCoord + vec2(0.0015625, 0.0020833)).rgb;\
            vec3 leftIntensity = texture2D(texture, texCoord + vec2(-0.0015625, 0)).rgb;\
            vec3 rightIntensity = texture2D(texture, texCoord + vec2(0.0015625, 0)).rgb;\
            vec3 bottomIntensity = texture2D(texture, texCoord + vec2(0, 0.0020833)).rgb;\
            vec3 topIntensity = texture2D(texture, texCoord + vec2(0, -0.0020833)).rgb;\
            vec3 h = -secondary * topLeftIntensity - coef * topIntensity - secondary * topRightIntensity + secondary * bottomLeftIntensity + coef * bottomIntensity + secondary * bottomRightIntensity;\
            vec3 v = -secondary * bottomLeftIntensity - coef * leftIntensity - secondary * topLeftIntensity + secondary * bottomRightIntensity + coef * rightIntensity + secondary * topRightIntensity;\
\
            vec3 mag = vec3( length(vec2(h.r, v.r)) , length(vec2(h.g, v.g)) , length(vec2(h.b, v.b)) );\
            vec3 c = mix(c_edge,c_area,smoothstep(.5-smoothness*.5,.5+smoothness*.5,mag));\
            color.rgb = mix(color.rgb,c,alpha);\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_sobel_rgb, {
        secondary : secondary,
        coef : coef,
        smoothness : smoothness,
        alpha : alpha,
        c_edge : [r,g,b],
        c_area : [r2,g2,b2]
    });

    return this;
}

filters.posterize=function(steps) {
    let s_posterize = this.getShader('s_posterize',  null, '\
        uniform sampler2D texture;\
        uniform float steps;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = vec4(floor(color.rgb*(steps+vec3(1.)))/steps, color.a);\
        }\
    ');

    this.simpleShader( s_posterize, { steps: Math.round(steps) });

    return this;
}


filters.posterize_hue=function(hue,brightness) {
    let s_posterize_hue = this.getShader('s_posterize_hue',  null, '\
        uniform sampler2D texture;\
        uniform float hue;\
        uniform float brightness;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec3 b=vec3(length(color.rgb));\
            vec3 h=color.rgb-b;\
            b=floor(b*brightness)/brightness;\
            h=floor(h*hue       )/hue       ;\
            gl_FragColor = vec4(b+h, color.a);\
        }\
    ');

    this.simpleShader( s_posterize_hue, { hue: Math.round(hue), brightness: Math.round(brightness) });

    return this;
}



/**
 * @filter        Hexagonal Pixelate
 * @description   Renders the image using a pattern of hexagonal tiles. Tile colors
 *                are nearest-neighbor sampled from the centers of the tiles.
 * @param centerX The x coordinate of the pattern center.
 * @param centerY The y coordinate of the pattern center.
 * @param scale   The width of an individual tile, in pixels.
 */
filters.hexagonalPixelate=function(centerX, centerY, scale) {
    let s_hexagonalPixelate = this.getShader('s_hexagonalPixelate',  null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
        uniform float scale;\
        varying vec2 texCoord;\
        void main() {\
            vec2 tex = (texCoord - center) / scale;\
            tex.y /= 0.866025404;\
            tex.x -= tex.y * 0.5;\
            \
            vec2 a;\
            if (tex.x + tex.y - floor(tex.x) - floor(tex.y) < 1.0) a = vec2(floor(tex.x), floor(tex.y));\
            else a = vec2(ceil(tex.x), ceil(tex.y));\
            vec2 b = vec2(ceil(tex.x), floor(tex.y));\
            vec2 c = vec2(floor(tex.x), ceil(tex.y));\
            \
            vec3 TEX = vec3(tex.x, tex.y, 1.0 - tex.x - tex.y);\
            vec3 A = vec3(a.x, a.y, 1.0 - a.x - a.y);\
            vec3 B = vec3(b.x, b.y, 1.0 - b.x - b.y);\
            vec3 C = vec3(c.x, c.y, 1.0 - c.x - c.y);\
            \
            float alen = length(TEX - A);\
            float blen = length(TEX - B);\
            float clen = length(TEX - C);\
            \
            vec2 choice;\
            if (alen < blen) {\
                if (alen < clen) choice = a;\
                else choice = c;\
            } else {\
                if (blen < clen) choice = b;\
                else choice = c;\
            }\
            \
            choice.x += choice.y * 0.5;\
            choice.y *= 0.866025404;\
            choice *= scale;\
            gl_FragColor = texture2D(texture, choice + center);\
        }\
    ');

    this.simpleShader( s_hexagonalPixelate, {
        center: [centerX+0.5, centerY+0.5],
        scale: scale
    });

    return this;
}

filters.pixelate=function(sx,sy,coverage,lens) {
    let s_pixelate = this.getShader('s_pixelate',  null, '\
        uniform sampler2D texture;\
        uniform vec2 size;\
        uniform float coverage;\
        uniform float lens;\
        varying vec2 texCoord;\
        void main() {\
            vec2 tc=(floor((texCoord-0.5)*size+0.5))/size+0.5;\
            vec2 fc=abs(texCoord-tc)*size;\
            tc+=(texCoord-tc)*lens;\
            if(fc.x<coverage && fc.y<coverage) gl_FragColor = texture2D(texture, tc);\
            else                               gl_FragColor = vec4(0.);\
        }\
    ');

    this.simpleShader( s_pixelate, {
        size:[sx,sy],
        coverage: coverage/2.0,
        lens: lens
    });

    return this;
}


/**
 * @filter        Color Halftone
 * @description   Simulates a CMYK halftone rendering of the image by multiplying pixel values
 *                with a four rotated 2D sine wave patterns, one each for cyan, magenta, yellow,
 *                and black.
 * @param centerX The x coordinate of the pattern origin.
 * @param centerY The y coordinate of the pattern origin.
 * @param angle   The rotation of the pattern in radians.
 * @param size    The diameter of a dot in pixels.
 */
filters.colorHalftone=function(centerX, centerY, angle, size) {
    let s_colorHalftone = this.getShader('s_colorHalftone',  null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
        uniform float angle;\
        uniform float scale;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        \
        float pattern(float angle) {\
            float s = sin(angle), c = cos(angle);\
            vec2 tex = texCoord * texSize - center;\
            vec2 point = vec2(\
                c * tex.x - s * tex.y,\
                s * tex.x + c * tex.y\
            ) * scale;\
            return (sin(point.x) * sin(point.y)) * 4.0;\
        }\
        \
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec3 cmy = 1.0 - color.rgb;\
            float k = min(cmy.x, min(cmy.y, cmy.z));\
            cmy = (cmy - k) / (1.0 - k);\
            cmy = clamp(cmy * 10.0 - 3.0 + vec3(pattern(angle + 0.26179), pattern(angle + 1.30899), pattern(angle)), 0.0, 1.0);\
            k = clamp(k * 10.0 - 5.0 + pattern(angle + 0.78539), 0.0, 1.0);\
            gl_FragColor = vec4(1.0 - cmy - k, color.a);\
        }\
    ');

    this.simpleShader( s_colorHalftone, {
        center: [centerX, centerY],
        angle: angle,
        scale: Math.PI / size,
        texSize: [this.width, this.height]
    });

    return this;
}

/**
 * @description Invert the colors!
 */

filters.invertColor=filters.invert=function() {
    let s_invert = this.getShader('s_invert',  null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            color.rgb = 1.0 - color.rgb;\
            gl_FragColor = color;\
        }\
    ');
    this.simpleShader( s_invert, {});
    return this;
}

filters.glitch=function(scale,detail,strength,speed) {
    this._.glitch_time=(this._.glitch_time || 0.0)+0.0001*speed;
    let s_glitch = this.getShader('s_glitch',  null, '\
        uniform sampler2D texture;\
        uniform float time;\
        uniform float strength;\
        uniform float detail;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        vec3 rand(vec3 seed) {\
            return fract(sin(seed * 43758.5453) + seed);\
        }\
        vec3 glitch(vec3 dc, float seed,float scale)\
        {\
            vec3 primes=vec3(3.0,17.0,23.0);\
            vec3 fxs=rand(seed*primes/11.0)*scale;\
            vec3 fys=rand(seed*primes/13.0)*scale-fxs;\
            vec3 as=rand(seed*primes/27.0);\
            vec3 ps=rand(seed*primes/33.0)*scale;\
            vec2 d=texCoord*scale;\
            return smoothstep(0.8,0.95,abs(as*strength))*as*cos(fxs*d.x+fys*d.y+ps)*3.0*dc;\
        }\
        \
        void main() {\
            vec4 dc    = texture2D(texture, floor(texCoord*texSize)/texSize );\
            vec3 primes=vec3(3.0,17.0,23.0);\
            float time_seed=sin(floor(dot(time*primes,primes.zxy)));\
            float seed =dot(floor(texCoord*texSize),vec2(texSize.y,1.0)+time_seed);\
            float seed2=floor(dot(floor(texCoord*texSize),vec2(0.013,1.0)))+floor(time_seed/17.);\
            vec3 glitch2=glitch(dc.rgb,seed2,detail/16.0);\
            vec4 color = texture2D(texture, texCoord+glitch2.xy/texSize.xy*16.0);\
            color.rgb+=glitch(dc.rgb,seed,detail)+glitch2;\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_glitch, {
        detail:detail,
        strength: strength,
        texSize: [this.width/scale, this.height/scale],
        time: this._.glitch_time
    });

    return this;
}

/* Mirrors the image vertically (useful for webcams) */
// also used for rendering into the canvas, that seem to display mirrored.
filters.mirror_y = function() {
    let s_mirror_y = this.getShader('s_mirror_y',  null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, vec2(1.0 - texCoord.x,texCoord.y));\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_mirror_y, {});
    return this;
}

/* Mirrors the image horizontally */
filters.mirror_x = function(target) {
    let s_mirror_x = this.getShader('s_mirror_x',  null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, vec2(texCoord.x, 1.0-texCoord.y));\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_mirror_x, {}, null, target);
    return this;
}

//canvas._.midi_init=false;
filters.midi=function(device, rows, cols, toggles) {
  device=Math.floor(device);
  rows=Math.floor(rows);
  cols=Math.floor(cols);
  midi.echo_toggles=!!toggles;

  if(!this._.midiState)
  {
    this._.midiState  =new Uint8Array(rows*cols);
    this._.midiTexture=new Texture(this.gl, rows,cols,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
  }

  this._.midiState.fill(0);

  for(var i=0; i<127; i++)
    if(midi.toggles['0 '+i] && i<rows*cols)
    {
      this._.midiState[i]=255;
    }

  this._.midiTexture.load(this._.midiState);
  this._.midiTexture.copyTo(this.texture);
}


