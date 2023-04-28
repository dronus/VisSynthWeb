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
import {devices} from "./devices.js"
import * as audio from "./audio.js"
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
filters.switch_chain=function({chain_index,time_min,time_max}) {
  if(this.switched) 
    this.switch_chain_time=Date.now()+time_min*1000. + Math.random()*(time_max-time_min)*1000.;
  
  if(Date.now()>this.switch_chain_time){
    switchChain(Math.floor(chain_index));
    // prevent re-trigger until chain switch, which may take some cycles
    this.switch_chain_time=Infinity;
  }
}

// set canvas update proposed fps
filters.fps=function({fps}){
  this.proposed_fps=fps;
};

// switch to use 8bit textures for the next effects
filters.type_byte=function(){
  this.template.type=this.gl.UNSIGNED_BYTE;
};

// switch to use float32 textures for the next effects
filters.type_float=function(){
  var ext=this.gl.getExtension('OES_texture_half_float');
  this.gl.getExtension('OES_texture_half_float_linear');  
  this.template.type=ext.HALF_FLOAT_OES;
};

// set resolution, filtering, texture type, fps limit at once
filters.resolution=function({x,y,filtering,precision,fps_limit}){
  this.proposed_fps=fps_limit;
  var t=this.template;
  this.width=t.width=x;
  this.height=t.height=y;

  if(precision=='linear') this.type_byte();
  if(precision=='float')  this.type_float();

  filters.filtering.call(this,{linear: filtering=="linear" ? 1 : 0});
};

// set filtering (>0: linear, <0 nearest)
filters.filtering=function({linear}) {
  this.template.filter=linear>0 ? this.gl.LINEAR : this.gl.NEAREST;
}

// warping shader template used by several effects 
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

// blend two images using the second one's alpha channel
filters.blend_alpha=function({alpha}) {

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
    this.simpleShader( s_blend_alpha, {alpha:clamp(0.,alpha,1.)}, {texture2: this.texture, texture1: texture1});

    return this;
}

// multiply color values of two images
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
    this.simpleShader( s_multiply, {}, {texture2: this.texture, texture1: texture1});

    return this;
}

// blend two additonal images using the current one as mask
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
    this.simpleShader( s_blend_mask, {},{mask: this.texture, texture1: texture1, texture2: texture2});

    return this;
}

// render superquadric mesh objects, textured by the given image
filters.superquadric=function({A,B,C,r,s,t,angle}) {
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

// store current image into "feedback" buffer, to reuse it when rendering the next frame
filters.feedbackIn=function() {
    // Store a copy of the current texture in the feedback texture unit
    this._.feedbackTexture=this.getSpareTexture(this._.feedbackTexture);

    this.texture.copyTo(this._.feedbackTexture);

    return this;
}

// blank out image periodically
filters.strobe=function({period}) {
    var t=this.texture;
    this.filter_instance.texture=this.getSpareTexture(this.filter_instance.texture);

    this.filter_instance.phase=((this.filter_instance.phase|0)+1.) % period;
    if(this.filter_instance.phase==0) this.texture.copyTo(this.filter_instance.texture);
    else                      this.filter_instance.texture.copyTo(this.texture);

    return this;
}

// fill image with tiled copys of current image
filters.tile=function({divisions,center:{x,y}}) {
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

    this.simpleShader( s_tile, {size:divisions,center: [x,y]});

    return this;
}

// render "supershape" mesh using the current image as texture
filters.supershape=function({angleX,angleY,a1,b1,m1,n11,n21,n31,a2,b2,m2,n12,n22,n32}) {

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

// render 2d "superelipse" transform of current image
filters.superellipse=function({size,angle,a,b,m,n1,n2,n3}) {
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

// apply a grating on top off the image
filters.grating=function({size,angle,ax,fx,ay,fy}) {
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

// replace a pixels color by some neighbour pixels depending on its color
filters.colorDisplacement=function({angle,strength}) {
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
        amplitude: strength,
        texSize: [this.width, this.height]        
    });

    return this;
}

// single colored matte
filters.matte=function({rgb:{r,g,b,a}}) {
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

// static noise
filters.noise=function({seed}) {
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

// draw a single-colored polygon
filters.polygon_matte=function({color:{r,g,b,a},sides,x,y,size,angle,aspect}) {

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

// draw a single colored rectangle
filters.rectangle=function({color:{r,g,b,a},x,y,width,height,angle}) {

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

// video clip source.
filters.video=function({url,play_sound,speed,loop}) {
    if(!this.filter_data.video) this.filter_data.video={};
    var v=this.filter_data.video[url];
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
      this.filter_data.video[url]=v;
    }  
      
    v.playbackRate=speed || 1.0;

    // make sure the video has adapted to the video source
    if(v.currentTime==0 || !v.videoWidth) return this;

    if(!this.filter_data.texture) this.filter_data.texture=this.toTexture(v);
    this.filter_data.texture.loadContentsOf(v);
    var target=this.getSpareTexture();
    this.filter_data.texture.copyTo(target);
    this.putTexture(target);
        
    return this;
}

// a HTML canvas source
filters.canvas=function({selector}) {

  var c = document.querySelector(selector);

  var canvasTexture=this.getSpareTexture(null,c.width,c.height);
  canvasTexture.loadContentsOf(c);
  this.putTexture(canvasTexture);
}


// a static image source
filters.image=function({url}) {

    if(!this.filter_data[url]) this.filter_data[url]={};
    let url_data=this.filter_data[url];

    var v=url_data.image;
    if(!v)
    {
      var v = document.createElement('img');
      v.crossOrigin = "anonymous";
      v.src=url;
      url_data.image=v;
    }

    // make sure the image has adapted to the image source
    if(!url_data.texture && url_data.image.complete)
    {
      url_data.texture=this.getSpareTexture(null,v.width,v.height);
      url_data.texture.loadContentsOf(v);
    }
    
    if(url_data.texture)
    {
      var target=this.getSpareTexture();
      url_data.texture.copyTo(target);
      this.putTexture(target);
    }
        
    return this;
}

// ripple displacement
filters.ripple=function({width,length,angle,strength}) {
    let s_ripple = warpShader(this, 's_ripple', '\
        uniform vec4 xform;\
        uniform float amplitude;\
    ', '\
        mat2 mat=mat2(xform.xy,xform.zw);\
        coord += amplitude*sin(mat*coord);\
    ');

    this.simpleShader( s_ripple, {
        xform: [
           Math.cos(angle)*width, Math.sin(angle)*length,
          -Math.sin(angle)*width, Math.cos(angle)*length
        ],
        amplitude: strength,
    });

    return this;
}

// spherical distortion
filters.spherical=function({radius,scale}) {
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

// cushion distortion
filters.cushion=function({strength}) {
    let s_cushion = warpShader(this, 's_spherical', '\
        uniform float strength;\
    ', '\
        float l=length(coord);\
        coord*=(1. + l * strength)/(1. + 0.5 * strength);\
    ');

    this.simpleShader( s_cushion, {
        strength: strength,
    });

    return this;
}

// geometric shapes for transforms
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

// displace pixels in 3d depending on their color
filters.mesh_displacement=function({sx,sy,sz,anglex,angley,anglez,mesh}) {

    if(!mesh_transforms[mesh]) mesh="plane";

    if(!this.shaders.s_mesh_displacement) this.shaders.s_mesh_displacement={};
    if(!this.shaders.s_mesh_displacement[mesh])
    {
    this.shaders.s_mesh_displacement[mesh] = new Shader(this.gl, '\
    attribute vec2 _texCoord;\
    varying vec2 texCoord;\
    uniform mat4 matrix;\
    uniform sampler2D displacement_map;\
    uniform vec3 strength;\
    void main() {\
        texCoord = _texCoord;\
        vec3 dis = texture2D(displacement_map, _texCoord).xyz-0.5;\
        vec4 pos= (vec4(vec3(_texCoord,0.0)+dis*strength,1.0));\
        '+mesh_transforms[mesh]+' \
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
    this.shaders.s_mesh_displacement[mesh].attributes({_texCoord:gridMeshUvs},{_texCoord:2});
    }
    var mesh_shader=this.shaders.s_mesh_displacement[mesh];

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

// blend two images together
filters.blend=function({alpha,factor,offset}) {
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

    this.simpleShader( s_blend, {alpha,factor: factor || 1.,offset: offset || 0.}, {texture: this.texture, texture1: this.stack_pop()});

    return this;
}

// circular arangement of symmetric copys of the image
filters.kaleidoscope=function({sides,angle,angle2}) {
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

// map image to mandelbrot set (map image by mandelbrot iteration)
filters.mandelbrot=function({center:{x,y},size,angle,iterations}) {

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
           Math.cos(angle)*size, Math.sin(angle)*size,
          -Math.sin(angle)*size, Math.cos(angle)*size
        ],
        iterations  : iterations,
        center: [x,y]
    });

    return this;
}

// map image into julia set (map pixels by julia iterations)
filters.julia=function({cx,cy,center:{x,y},size,angle,iterations}) {

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
           Math.cos(angle)*size, Math.sin(angle)*size,
          -Math.sin(angle)*size, Math.cos(angle)*size
        ],
        iterations  : iterations,
        c: [cx,cy], 
        center: [x,y],
        texSize: [this.width, this.height]
    });

    return this;
}

// relief filter - add shaded look by ofsetting bright vs. dark pixels
filters.relief=function({scale2,scale4}) {
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
      
    this.simpleShader( s_relief, {
        texSize: [1./this.width,1./this.height],
    },{
        texture: texture,
        texture_blur2: textures[0],
        texture_blur4: textures[1]
    });

    return this;
}

// affine transform - translate, rotate, scale, shear image
filters.transform=function({x,y,scale,angle,sx,sy,wrap}) {
    let s_transform = this.getShader('s_transform',  null, '\
        uniform sampler2D texture;\
        uniform vec2 translation;\
        uniform vec4 xform;\
        varying vec2 texCoord;\
        uniform vec2 aspect;\
        uniform float wrap;\
        void main() {\
          mat2 mat=mat2(xform.xy,xform.zw);\
          vec2 uv=(mat*((texCoord-vec2(0.5,0.5))*aspect+translation))/aspect+vec2(0.5,0.5); \
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

// simulate chemical film exposure and development
filters.analogize=function({exposure,gamma,glow,glow_radius}) {
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

    filters.blur.call(this,{radius:glow_radius});

    this.simpleShader( s_analogize, {
        Glow: glow,
        Exposure: exposure,
        Gamma: gamma
    },{
        glow_texture: this.texture,
        texture: this.stack_pop()
    });

    return this;
}

// remove alpha channel from image
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

// store image for preview. this does not affect the output image,
// but stores a copy of the current image "under construction" 
// to send as preview. 
filters.preview=function() {
    if(!this.previewTexture) return;
    //this.preview_width=320; this.preview_height=200;
    // this.gl.viewport(0,0,this.preview_width,this.preview_height);
    filters.mirror_x.call(this,{target:this.previewTexture}); // for some reason, picture is horizontally mirrored. Store it into the canvas the right way.
    //this.gl.viewport(0,0,this.width,this.height);

    return this;
}

filters.resize=function({w,h}) {
  var texture=this.getSpareTexture(null,w, h);
  this.texture.copyTo(texture);
  this.putTexture(texture);
  this.width=this.template.width=w;
  this.height=this.template.height=h;
}

filters.canvas_plugin=async function({fn_name,keep}) {
  let fn=window[fn_name];
  if(!fn) return;
  if(!this.filter_instance.busy) {
  
    let img=new ImageData(this.texture.width,this.texture.height);
    this.texture.copyToArray(img.data);

    let result=await fn(img);

    if(result instanceof Promise) {
      let filter_instance=this.filter_instance; // closure for promise, as filter_instance is switching
      filter_instance.busy=true;
      result.then((img)=>{
        filter_instance.busy=false;
        if(img)
          filter_instance.image=img;
      },
      () => {filter_instance.busy=false});
    }else{
      if(result)
       this.filter_instance.image=result;
     this.filter_instance.busy=false;
    }
  }

  if(this.filter_instance.image){
    var imageTexture=this.getSpareTexture(null,this.filter_instance.image.width, this.filter_instance.image.height);
    imageTexture.loadContentsOf(this.filter_instance.image);
    this.putTexture(imageTexture);
    if(!keep) this.filter_instance.image=null;
  }
}

// pull image from "feedback" buffer 
// where it needs to be copied by "feedbackIn" on rendering the frame before.
filters.feedbackOut=function({blend,clear_on_switch}) {
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

    this.simpleShader( s_feedbackOut, {
        blend: blend
    },{
        texture: this.texture,
        feedbackTexture: this._.feedbackTexture
    });

    return this;
}

// detect parts of the image in motion by pixel-wise comparison 
// with a slowly updated background image.
// remove non-moving image parts (alpha channel)
filters.motion=function({threshold,interval,damper}) {
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

    this.filter_instance.texture=this.getSpareTexture(this.filter_instance.texture);

    if(!this.filter_instance.cycle || this.filter_instance.cycle>interval)
    {
      // blend current image into mean motion texture
      var target=this.getSpareTexture();

      this.simpleShader( s_motionBlend, {
          blend: damper
      },{
          texture: this.texture,
          motionTexture: this.filter_instance.texture
      },target);

      this.releaseTexture(this.filter_instance.texture);
      this.filter_instance.texture=target;

      this.filter_instance.cycle=0;
    }
    this.filter_instance.cycle++;

    // rebind, motionTexture was exchanged by simpleShader
    this.simpleShader( s_motion, {
        threshold: threshold
    },{
        texture: this.texture,
        motionTexture: this.filter_instance.texture
    });

    return this;
}

// a simple blur shader, used by several effects.
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

// simulate a reaction-diffusion-system (like chemical ones), using the pixel
// colors to encode the state. 
// if sandwiched between feedbackOut and feedbackIn, a cellular automaton is created.
filters.reaction=function({noise_factor,zoom_speed,scale1,scale2,scale3,scale4}) {

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
    
    this.simpleShader( s_reaction, {
        texSize: [1./this.width,1./this.height],
        rnd: [Math.random(),Math.random(),Math.random(),Math.random()],
        noise_factor: noise_factor,
        zoom_speed: zoom_speed
    },{
        texture: texture,
        texture_blur: textures[0],
        texture_blur2: textures[1],
        texture_blur3: textures[2],
        texture_blur4: textures[3]
    });

    return this;
}


// another reaction-diffusion simulation
// sandwich between feedbackOut and feedbackIn to create a cellular automaton.
filters.reaction2=function({F,K,D_a,D_b,speed}) {
    speed=Math.floor(Math.min(speed,100.));
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
    for(var i=0; i<speed; i++)
      this.simpleShader( s_reaction2, {F:F,K:K,D_a:D_a,D_b:D_b, scale: [this.width,this.height] });

    return this;
}

// displace pixels depending on their brightness
// each pixel is replaced by some neighbouring pixel depending on it's own color.
// to move every pixel depening on it's own color, use mesh_displacement instead.
filters.displacement=function({strength}) {
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

    this.simpleShader( s_displacement, { strength: strength },{displacement_map: this.texture, texture: this.stack_pop()});

    return this;
}

// pertubate image row and collumn adressing,
// thus simulating graphic RAM address bus errors
filters.address_glitch=function({mask_x,mask_y}) {
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

// add a gauze-like overlay to the image
filters.gauze=function({width,length,angle,strength,center:{x,y}}) {

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
           Math.cos(angle)*width, Math.sin(angle)*length,
          -Math.sin(angle)*width, Math.cos(angle)*length
        ],
        amplitude: strength,
        center: [x,y],
        texSize: [this.width, this.height]
    });

    return this;
}

// choose which audio device to use for audio-dependent effects and parameter generators.
// "select_audio":{"device":0.0}
filters.select_audio=function({device}) {
  audio.set_device(device);
}

// create 1D image from audio waveform data.
filters.waveform=function() {
    var values=audio.getWaveform();
    if(!values) return;
    
    // TODO using this effect seems to create TWO textures of this format. Why? Do other filters suffer this as well?
    var waveformTexture=this.getSpareTexture(null,values.length,1,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
    waveformTexture.load(values);
    this.putTexture(waveformTexture);
        
    return this;
}

// display waveform osciloscope from audio waveform data.
// the waveform is displayed as linear spread, so "threshold" can be used 
// to isolate a thin / thick line-like waveform display.
filters.osciloscope=function({amplitude}) {
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

    var values=audio.getWaveform();
    if(!values) return;

    var waveformTexture=this.getSpareTexture(null,values.length,1,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
    waveformTexture.load(values);

    this.simpleShader( s_osciloscope, {amplitude:amplitude}, waveformTexture);
    
    this.releaseTexture(waveformTexture);

    return this;
}

// plot audio data against phase-shift audio data
filters.vectorscope=function({size,intensity,linewidth}) {
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
    var values=audio.getWaveform();
    if(!values) return;
    var count=values.length;

    // generate line segments
    if(!this.filter_data.UVs)
    {
      this.filter_data.UVs=[];
      for (var t=0;t<=1.0;t+=1.0/count)
        this.filter_data.UVs.push(t);
      s_vectorscope.attributes({_texCoord:this.filter_data.UVs},{_texCoord:1});
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

// create a luma keying, making darker parts of the image transparent (alpha channel)
filters.lumakey=filters.luma_key=function({threshold,feather}) {
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

    this.simpleShader( s_lumakey, { threshold: threshold, feather: feather },{texture: this.texture, texture1: this.stack_pop()});

    return this;
}

// create a color key, making colors similiar to a given rgb color transparent (alpha channel)
filters.chroma_key_rgb=function({color:{r,g,b},threshold,feather}) {
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

    this.simpleShader( s_chroma_key_rgb, 
      { key_color:[r,g,b], threshold: threshold, feather: feather },
      {texture: this.texture, texture1: this.stack_pop()}
    );

    return this;
}

// create a color key, making colors inside a given hsl range transparent (alpha channel)
filters.chroma_key=function({h,s,l,h_width,s_width,l_width,h_feather,s_feather,l_feather}) {
 
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
    this.simpleShader( s_chroma_key, 
      { hsv_key:[h,s,l], hsv_key_width:[h_width,s_width,l_width],hsv_key_feather:[h_feather,s_feather,l_feather]},
      {texture: this.texture, texture1: this.stack_pop()}
    );

    return this;
}

// compute a new image by applying Conway's "game of life" rules to the pixels.
// sandwich this between feedbackOut, feedbackIn to create a game of life automaton
filters.life=function({iterations}) {
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

// draw a polygon on top of the image
filters.polygon=function({sides,x,y,size,angle,aspect}) {

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


// create an adjustable delay by storing one or more past images.
// the time offset can by animated by parameters to temporarely speed up / slow down / yerk time by some frames.
// TODO check wether we remiplement this by compressed textures or even an encoded video stream (WebRTC APIs or WebAsm codecs)
filters.timeshift=function({time,clear_on_switch}) {
    // Store a stream of the last seconds in a ring buffer

    // calculate a sane frame limit by estimating it's memory needs.
    //
    var t=this.texture;
    // TODO this.gl.FLOAT is a wrong identifier, it is oes.HALF_FLOAT with 2 or oes.FLOAT with 4 bytes.
    var frame_bytes = t.width * t.height * 4 * (t.type==this.gl.FLOAT ? 2 : 1);
    var max_buffer_bytes=256000000;
    var max_frames=Math.floor(max_buffer_bytes / frame_bytes);

    if(!this.filter_instance.textures) this.filter_instance.textures=[];
  
    if(clear_on_switch && this.switched)
      for(let key in this.filter_instance.textures)
        this.filter_instance.textures[key].clear();

    // copy current frame to the start of the queue, pushing all frames back

    var nt=null;
    if(this.filter_instance.textures.length>=max_frames)
      nt=this.filter_instance.textures.pop();
      
    nt=this.getSpareTexture(nt);
    this.texture.copyTo(nt);
    this.filter_instance.textures.unshift(nt);

    // copy past frame from the queue to the current texture, if available
    var j=Math.abs(Math.floor(time) % max_frames);
    if(this.filter_instance.textures[j]) 
    {
      this.filter_instance.textures[j].copyTo(this.texture);
    }

    return this;
}

// a video device capture source
// get the video feed from a capture device name by source index
// opens the capture device and starts streaming on demand
var videos={};
filters.capture=function({device,w,h,sync}) {

    device=Math.floor(device);

    // just return video, if already started
    if(!videos[device]) {

      console.log("Acquire stream for device index "+device);

      // create a new <video> element for decoding the capture stream
      var video = document.createElement('video');
      videos[device]=video;

      var constraints = {
        video: { 
          deviceId: devices.video[device]?.deviceId,
          width:  {"ideal": w ? w : this.width },
          height: {"ideal": h ? h : this.height}
        },
        audio:false
      };

      var connect = function() {
       window.navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
        console.log("Got camera!");
        // capture device was successfully acquired
        video.muted=true;
        video.srcObject = stream;
        video.play();
       });
      }
      connect();
      window.navigator.mediaDevices.addEventListener('devicechange',function(e){
        console.log('devicechange event',e);
        // our camera may be just plugged in (after plugged out, or for the first time), so try to connect again.
        if(!video.srcObject || !video.srcObject.active) connect();
      });
    }
    
    let v=videos[device];

    if(sync) this.setSyncSource(v);

    // make sure the video has adapted to the capture device
    if(!v || v.currentTime==0 || !v.videoWidth) return this; 
    
    var videoTexture=this.getSpareTexture(null,v.videoWidth, v.videoHeight);
    videoTexture.loadContentsOf(v);
    this.putTexture(videoTexture);
    
    return this;
}

// a WebRTC video stream source
filters.webrtc=function({websocket_url}) {
    if(!this.webrtc_videos) {
      this.webrtc_videos={};
      this.webrtc_peers={};
    }
    if(!this.webrtc_videos[websocket_url]) {
      let v=this.webrtc_videos[websocket_url]=document.createElement('video');
      v.muted=true;
      v.autoplay=true;
      import("./webrtc.js").then(async(webrtc) => {
        let path=new URL(websocket_url).pathname || '/webrtc';
        this.webrtc_peers[websocket_url]=await  webrtc.WebRTC(websocket_url, path, null, v, null);
        v.play();
      });
    }

    let v=this.webrtc_videos[websocket_url];
    // make sure the video has adapted to the capture source
    if(!v || v.currentTime==0 || !v.videoWidth) return this;
    if(!this.filter_instance.texture) this.filter_instance.texture=this.toTexture(v);
    this.filter_instance.texture.loadContentsOf(v);
    this.filter_instance.texture.copyTo(this.texture);

    return this;
}

// change image to false colors selected from all rainbow colors depending on their brightness
filters.rainbow=function({size, angle}) {
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

// draw a grid on top of the image
filters.grid=function({size, angle, x, y, linewidth=0.05}) {
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

    this.simpleShader( s_grid, {size: [size*10.,size/this.width*this.height*10.], angle:angle, width:linewidth, offset:[x,y]
    });

    return this;
}

filters.absolute=function({size, angle}) {
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

// remove image noise by combining adjacent pixels
filters.denoisefast=function({strength}) {
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
            exponent: Math.max(0, strength),
            texSize: [this.width, this.height]
        });
    }

    return this;
}

// audio spectrogram video source
filters.spectrogram=function() {
    var values=audio.getSpectrogram();
    if(!values) return;
    
    var spectrogramTexture=this.getSpareTexture(null,values.length,1,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
    spectrogramTexture.load(values);
    this.putTexture(spectrogramTexture);
    
    
    return this;
}

// "smooth" version of game-of-life like rules.
// sandwich this between feedbackOut, feedbackIn to create a cellular automaton
filters.smoothlife=function({birth_min,birth_max,death_min}) {
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

// "soft", eg. analog version of game-of-life like rules.
// sandwich this between feedbackOut, feedbackIn to create a cellular automaton
filters.soft_life=function({birth_min,birth_max,death_min}) {
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

    filters.blur.call(this,{radius:5.});
    var inner_texture=this.stack_push();
    filters.blur.call(this,{radius:10.});

    this.stack_pop();
        
    this.simpleShader( s_soft_life, 
      {
        birth_min:birth_min,
        birth_max:birth_max,
        death_min:death_min,
      },
      {inner_texture: inner_texture, outer_texture: this.texture}
    );

    return this;
}

// replace image by a cloud of particles colored by the original image
// and moving to some physical rules
filters.particles=function({anglex,angley,anglez,size,strength,homing,noise,displacement}) {
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
    if(!this.filter_data.particleUvs)
    {
      this.filter_data.particleUvs=[];
      var dx=1./w;
      var dy=1./h;
      for (var y=0;y<=1.0;y+=dy) {
          for (var x=0;x<=1.0;x+=dx) {        
              this.filter_data.particleUvs.push(x,y);
          }
      }
      s_particles.attributes({_texCoord:this.filter_data.particleUvs},{_texCoord:2});
      
      // generate particle data double buffer
      if(!this.filter_data.particleTextureA) {
        var type;
        var oes=this.gl.getExtension( 'OES_texture_float' );
        if (!oes) {
          console.log('particle effect recommends gl.FLOAT textures, falling back to gl.BYTE');
          type=this.gl.UNSIGNED_BYTE;
        }else
          type=oes.FLOAT;
        this.filter_data.particleTextureA=this.getSpareTexture(null, w,h, this.gl.RGBA, type);
        this.filter_data.particleTextureB=this.getSpareTexture(null, w,h, this.gl.RGBA, type);
      }
    }
   
    [this.filter_data.particleTextureB,this.filter_data.particleTextureA]=[this.filter_data.particleTextureA,this.filter_data.particleTextureB];

    s_particle_update.uniforms({
      homing:homing,
      noise:noise,
      displacement:displacement
    });             
    var texture=this.stack_pop();
    s_particle_update.textures({displacement_texture: texture, texture: this.filter_data.particleTextureB});
        
    this.filter_data.particleTextureA.setAsTarget();
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
    s_particles.textures({particles: this.filter_data.particleTextureA, texture: this.texture});

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

// push a copy of the current image to the "stack"
filters.stack_push=function({from_texture}) {
  this.stack_push(from_texture);
}

// exchage the current image with the one on top of the "stack"
filters.stack_swap=function() {
  // exchange topmost stack element with current texture
  if(this.stack.length<1) return;
  
  var tmp=this.texture;
  this.texture=this.stack[this.stack.length-1];
  this.stack[this.stack.length-1]=tmp;
}

// slice image to a lot of small patches, displaced by their original position
// according to the colors of another image
filters.patch_displacement=function({sx,sy,sz,anglex,angley,anglez,scale,pixelate}) {
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
    if(!this.filter_data.gridPatchesVertices)
    {
      this.filter_data.gridPatchesVertices=[];
      this.filter_data.gridPatchesUvs=[];
      var dx=1./160.;
      var dy=1./100.;
      for (var y=0;y<=1.0;y+=dy) {
          for (var x=0;x<=1.0;x+=dx) {        
              this.filter_data.gridPatchesVertices.push(x,y,0);
              this.filter_data.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this.filter_data.gridPatchesVertices.push(x,y+dy,0);
              this.filter_data.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this.filter_data.gridPatchesVertices.push(x+dx,y+dy,0);
              this.filter_data.gridPatchesUvs.push(x+dx/2,y+dy/2);

              this.filter_data.gridPatchesVertices.push(x,y,0);
              this.filter_data.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this.filter_data.gridPatchesVertices.push(x+dx,y+dy,0);
              this.filter_data.gridPatchesUvs.push(x+dx/2,y+dy/2);
              this.filter_data.gridPatchesVertices.push(x+dx,y,0);
              this.filter_data.gridPatchesUvs.push(x+dx/2,y+dy/2);
          }
      }
      s_patch_displacement.attributes({vertex: this.filter_data.gridPatchesVertices,_texCoord:this.filter_data.gridPatchesUvs},{vertex: 3, _texCoord:2});
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

// warps one quadrangle to another with a perspective transform. This can be used to
// make a 2D image look 3D or to recover a 2D image captured in a 3D environment.
filters.perspective=function({perspective:{x1, y1, x2, y2, x3, y3, x4, y4}}) {

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


    var a = getSquareToQuad.apply(null, [x1, y1, x2, y2, x3, y3, x4, y4]);
    var b = getSquareToQuad.apply(null, [-0.5,-0.5, -0.5,0.5, 0.5,-0.5, 0.5,0.5]);
    var c = mat4.multiply( b,mat4.inverse(a));
    var d = mat4.toMat3(c);
    return filters.matrixWarp.call(this,d,false);
}

// transform image according to a transformation matrix. 
// used as building block for transformation effects.
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

// warps the image in a swirl-like fashion around it's center
filters.swirl=function({center:{x,y}, radius, strength}) {
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
        center: [x, y],
        angle: strength
    });

    return this;
}

// bulge or pinch the image around the center
filters.bulgePinch=function({center:{x,y}, radius, strength}) {
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
        center: [x, y]
    });

    return this;
}

// blur the image in direction of its center, 
// as it was exposed for some time while moving in or out.
filters.zoomBlur=function({center:{x, y}, size}) {
    let s_zoomBlur = this.getShader('s_zoomBlur',  null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
        uniform float strength;\
        varying vec2 texCoord;\
        float random(vec3 scale, float seed) {\
            /* use the fragment position for a different seed per-pixel */\
            return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);\
        }\
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
        center: [x+0.5, y+0.5],
        strength: size
    });

    return this;
}

// grow bright regions of an image
filters.dilate=function({iterations}) {
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

// maximise contrast on local parts of the image independently.
// this can be used to give an everywhere strong image from images
// lacking contrast in some parts or spanning a large brightness range.
filters.localContrast=function({size,strength}) {
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
    
    filters.blur.call(this,{radius:size});
    var min_image=this.stack_push();
    var max_image=this.stack_push();

    var steps=size/2;
    var delta=Math.sqrt(size);

    for(var i=0; i<steps; i++)
      this.simpleShader( s_localContrastMin, { delta: [delta/this.width, delta/this.height]}, min_image, min_image);

    for(var i=0; i<steps; i++)
      this.simpleShader( s_localContrastMax, { delta: [delta/this.width, delta/this.height]},max_image, max_image);

  
    this.simpleShader( s_localContrast, {strength:strength},original_image,{min_texture:min_image, max_texture:max_image});
    
    this.stack_pop();
    this.stack_pop();
    this.stack_pop();
  
    return this;
}

// shrink bright regions of an image
filters.erode=function({iterations}) {
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

// effectively compute a blur of the image.
// uses several stages, which may create some artifacts but allows for
// very fast blur even with larger radius.
filters.fastBlur=filters.blur=function({radius}) {
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

// blur image alpha channel only
filters.blur_alpha=function({radius}) {
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

// another blur filter, providing an adjustable exponent for
// pixel weighting.
filters.blur2=function({radius,exponent}) {
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


// the infamous "unsharp mask" image sharpening.
// amplifies high frequency image parts.
filters.unsharpMask=function({size, strength}) {
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
    this.stack_push();

    // Blur the current texture, then use the stored texture to detect edges
    filters.blur.call(this,{radius:size});
    this.simpleShader( s_unsharpMask, {strength: strength},{blurredTexture: this.texture, originalTexture: this.stack_pop()});

    return this;
}


// colorize image by adding a static color to all pixel color values.
filters.color=function({strength,rgb:{r,g,b}}) {
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
       a  : strength
    });

    return this;
}

// denoise image by applying a median-like filter.
// see denoiseFast for a preumable faster algorithm.
filters.denoise=function({strength}) {
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
            exponent: Math.max(0, strength),
            texSize: [this.width, this.height]
        });
    }

    return this;
}



// amplify saturation of low-saturated pixels.
filters.vibrance=function({strength}) {
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
        amount: clamp(-1, strength, 1)
    });

    return this;
}


// remap colors of all pixels by mapping an input range to a given output range and gamma correction.
filters.mixer=function({rr,rg,rb,ra, gr,gg,gb,ga, br,bg,bb,ba, ar,ag,ab,aa}) {
    let s_mixer = this.getShader('s_mixer',  null, '\
        varying vec2 texCoord;\
        uniform sampler2D texture;\
        uniform mat4 channel_matrix; \
        void main()\
        {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = channel_matrix * color;\
        }\
    ');
    this.simpleShader( s_mixer, {
        channel_matrix : [rr,rg,rb,ra, gr,gg,gb,ga, br,bg,bb,ba, ar,ag,ab,aa]
    });
}

// remap colors of all pixels by mapping an input range to a given output range and gamma correction.
filters.levels=function({min,gamma,max, r_min,g_min,b_min, r_gamma,g_gamma,b_gamma, r_max,g_max,b_max}) {
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

// change hue angle and saturation of the image
filters.hueSaturation=function({hue, saturation}) {
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

// adjust brightness and contrast of the image
filters.brightnessContrast=function({brightness, contrast}) {
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

// change contrast of the image by applying a s-curve to the pixels brightness
// this gives wider range and more natural contrast changes without clipping
filters.contrast_s=function({contrast}) {
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

// apply a threshold to the image, changing every rgb channel to full dark or bright
// depending on a given  threshold
filters.threshold=function({threshold,feather,r0,g0,b0,r1,g1,b1}) {
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

// apply sobel edge detection to the image, highlighting the contours in it
// or even replace the image by the contours only.
filters.sobel=function({secondary, coeff, alpha, areas, edges}) {
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
        coef : coeff,
        alpha : alpha,
        r : areas.r,
        g : areas.g,
        b : areas.b,
        a : areas.a,
        r2 : edges.r,
        g2 : edges.g,
        b2 : edges.b,
        a2: edges.a
    });

    return this;
}

// apply sobel edge detection to the image, highlighting the contours in it
// or even replace the image by the contours only.
// handle all rgb channels seperately.
filters.sobel_rgb=function({secondary, coeff, smoothness, alpha, areas, edges}) {
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
            vec3 c = mix(c_area,c_edge,smoothstep(.5-smoothness*.5,.5+smoothness*.5,mag));\
            color.rgb = mix(color.rgb,c,alpha);\
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( s_sobel_rgb, {
        secondary : secondary,
        coef : coeff,
        smoothness : smoothness,
        alpha : alpha,
        c_edge : [edges.r,edges.g,edges.b],
        c_area : [areas.r,areas.g,areas.b]
    });

    return this;
}

// "posterize" image by replace each pixel with a color from a smaller palette.
filters.posterize=function({steps}) {
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

// "posterize" image by replace each pixel with a color from a smaller palette, selected by hue distance.
filters.posterize_hue=function({hue,brightness}) {
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


// renders the image using a pattern of hexagonal tiles
filters.hexagonalPixelate=function({center:{x,y}, size}) {
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
        center: [x+0.5, y+0.5],
        scale: size
    });

    return this;
}

// render the image using larger rectangular tiles (large "pixels")
filters.pixelate=function({sx,sy,coverage,lens}) {
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


// simulate color dithering used in CMYK printing.
filters.colorHalftone=function({center:{x,y}, angle, size}) {
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
        center: [x,y],
        angle: angle,
        scale: Math.PI / size,
        texSize: [this.width, this.height]
    });

    return this;
}

// invert the image's pixel colors.
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

// simulate glitches well known from faults in JPEG image compression
// eg. block-wise displacement of image parts or strong colorful DCT-patterns
filters.glitch=function({scale,detail,strength,speed}) {
    this.filter_instance.glitch_time=(this.filter_instance.glitch_time || 0.0)+0.0001*speed;
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
        time: this.filter_instance.glitch_time
    });

    return this;
}

// mirror the image vertically (replace left and right)
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

// mirror the image horizontally (replace top and bottom)
filters.mirror_x = function({target}) {
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

// MIDI note input source
// render a rows by cols grid showing the state of each MIDI note (eg. keyboard keys)
filters.midi=function({device, rows, cols, echo}) {
  device=Math.floor(device);
  rows=Math.floor(rows);
  cols=Math.floor(cols);
  midi.echo_toggles=!!echo;

  if(!this.filter_data.midiState)
  {
    this.filter_data.midiState  =new Uint8Array(rows*cols);
    this.filter_data.midiTexture=new Texture(this.gl, rows,cols,this.gl.LUMINANCE,this.gl.UNSIGNED_BYTE);
  }

  this.filter_data.midiState.fill(0);

  for(var i=0; i<127; i++)
    if(midi.toggles['0 '+i] && i<rows*cols)
    {
      this.filter_data.midiState[i]=255;
    }

  this.filter_data.midiTexture.load(this.filter_data.midiState);
  this.filter_data.midiTexture.copyTo(this.texture);
}


