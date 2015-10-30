

canvas.for_all_textures=function(callback){
  callback(this._.texture);
  callback(this._.spareTexture);
  callback(this._.extraTexture);
};

canvas.type_byte=function(){
  this.for_all_textures(function(texture){
    texture.ensureFormat(texture.width,texture.height,texture.format,gl.UNSIGNED_BYTE);
  });
};

canvas.type_float=function(){
  this.for_all_textures(function(texture){
    texture.ensureFormat(texture.width,texture.height,texture.format,gl.FLOAT);
  });
};

canvas.resolution=function(w,h){
  this.for_all_textures(function(texture){
    texture.ensureFormat(w,h,texture.format,texture.type);
  });
};

// src/filters/common.js
var warpShader=function(uniforms, warp) {
    return new Shader(null, uniforms + '\
    uniform sampler2D texture;\
    uniform vec2 texSize;\
    varying vec2 texCoord;\
    void main() {\
        vec2 coord = texCoord * texSize;\
        ' + warp + '\
        gl_FragColor = texture2D(texture, coord / texSize);\
        vec2 clampedCoord = clamp(coord, vec2(0.0), texSize);\
        if (coord != clampedCoord) {\
            /* fade to transparent black if we are outside the image */\
            gl_FragColor *= max(0.0, 1.0 - length(coord - clampedCoord));\
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

// src/filters/video/blend_alpha.js
canvas.blend_alpha=function() {
    gl.blend_alpha = gl.blend_alpha || new Shader(null, '\
        uniform sampler2D texture1;\
        uniform sampler2D texture2;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color1 = texture2D(texture1, texCoord);\
            vec4 color2 = texture2D(texture2, texCoord);\
            gl_FragColor = mix(color1, color2, color2.a);\
        }\
    ');

    var texture1=this.stack_pop();
    gl.blend_alpha.textures({texture2: this._.texture, texture1: texture1});
    this.simpleShader( gl.blend_alpha, {});

    return this;
}

canvas.blend_mask=function() {
    gl.blend_mask = gl.blend_mask || new Shader(null, '\
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
    gl.blend_mask.textures({mask: this._.texture, texture1: texture1, texture2: texture2});
    this.simpleShader( gl.blend_mask, {});

    return this;
}


// src/filters/video/superquadric.js
canvas.superquadric=function(A,B,C,r,s,t,angle) {
    gl.superquadric = gl.superquadric || new Shader('\
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

  
    this._.texture.use(0);
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.superquadric.attributes({vertex:vertices,_texCoord:uvs},{vertex:3,_texCoord:2});
        gl.superquadric.uniforms(uniforms).drawArrays(gl.TRIANGLE_STRIP);
        gl.disable(gl.DEPTH_TEST);
    },true);
    this._.spareTexture.swapWith(this._.texture);
    
    return this;
}

// src/filters/video/feedbackIn.js
canvas.feedbackIn=function()
{
    // Store a copy of the current texture in the feedback texture unit

    var t=this._.texture;
    if(!this._.feedbackTexture) 
      this._.feedbackTexture=new Texture(t.width,t.height,t.format,t.type);
    
    this._.feedbackTexture.ensureFormat(this._.texture);
    this._.texture.copyTo(this._.feedbackTexture);

    return this;
}

// src/filters/video/tile.js
canvas.tile=function(size,centerx,centery) {
    gl.tile = gl.tile || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
      	uniform float size;\
        varying vec2 texCoord;\
        void main() {\
          vec4 color = texture2D(texture, fract((texCoord-center)*size));\
          gl_FragColor = color;\
        }\
    ');

    this.simpleShader( gl.tile, {size:size,center: [centerx,centery]});

    return this;
}


// src/filters/video/supershape.js
canvas.supershape=function(angleX,angleY,a1,b1,m1,n11,n21,n31,a2,b2,m2,n12,n22,n32) {

  if(!gl.supershape)
  {
    gl.supershape = new Shader('\
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
      gl.supershape.attributes({_texCoord:uvs},{_texCoord:2});
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
    this._.texture.use(0);
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 
        gl.supershape.uniforms(uniforms).drawArrays(gl.TRIANGLE_STRIP);
        gl.disable(gl.DEPTH_TEST);
    },true);
    this._.spareTexture.swapWith(this._.texture);
    
    return this;
}

// src/filters/video/colorDisplacement.js
canvas.colorDisplacement=function(angle,amplitude) {
    gl.colorDisplacement = gl.colorDisplacement || new Shader(null,'\
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

    this.simpleShader( gl.colorDisplacement, {
        angle: angle,    
        amplitude: amplitude,
        texSize: [this.width, this.height]        
    });

    return this;
}

// src/filters/video/matte.js
canvas.matte=function(r,g,b,a) {
    gl.matte = gl.matte || new Shader(null, '\
        uniform vec4 color;\
        void main() {\
            gl_FragColor = color;\
        }\
    ');
    if(typeof(a)=='undefined') a=1.; // legacy
    this.simpleShader( gl.matte, {color:[r,g,b,a]});
    return this;
}


canvas.polygon_matte=function(r,g,b,a,sides,x,y,size,angle,aspect) {

    gl.polygon_matte = gl.polygon_matte || new Shader(null, '\
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

    this.simpleShader( gl.polygon_matte, {
        color:[r,g,b,a],
        size:[size*this.height/this.width,size*aspect],
        sides:Math.floor(sides),
        angle:angle,
        center: [x,y]
    });

    return this;
}


// src/filters/video/video.js
canvas.video=function()
{

    var v=this._.videoFilterElement;
    if(!v)
    {
      var v = document.createElement('video');
      v.autoplay = true;
      v.muted=true;
      v.loop=true;
      v.src="test.mp4";
      this._.videoFilterElement=v;
    }  
      
    // make sure the video has adapted to the video source
    if(v.currentTime==0 || !v.videoWidth) return this; 
    
    if(!this._.videoTexture) this._.videoTexture=this.texture(v);    
    this._.videoTexture.loadContentsOf(v);
    this._.videoTexture.copyTo(this._.texture);
        
    return this;
}

canvas.image=function()
{

    var v=this._.imageFilterElement;
    if(!v)
    {
      var v = document.createElement('img');
      v.src="test.jpg";
      this._.imageFilterElement=v;
    }  
      
    // make sure the image has adapted to the image source
    if(!this._.imageTexture && v.width>0)
    {
      this._.imageTexture=this.texture(v);    
      this._.imageTexture.loadContentsOf(v);
      this._.imageFilterElement=null;
    }
    
    if(this._.imageTexture)
      this._.imageTexture.copyTo(this._.texture);
        
    return this;
}


// src/filters/video/ripple.js
canvas.ripple=function(fx,fy,angle,amplitude) {
    gl.ripple = gl.ripple || warpShader('\
        uniform vec4 xform;\
        uniform float amplitude;\
        uniform vec2 center;\
        mat2 mat=mat2(xform.xy,xform.zw);\
    ', '\
        coord -= center;\
        coord += amplitude*sin(mat*coord);\
        coord += center;\
    ');

    this.simpleShader( gl.ripple, {
        xform: [
           Math.cos(angle)*fx, Math.sin(angle)*fy,
          -Math.sin(angle)*fx, Math.cos(angle)*fy
        ],
        amplitude: amplitude,
        center: [this.width/2, this.height/2],
        texSize: [this.width, this.height]
    });

    return this;
}


// src/filters/video/mesh_displacement.js
canvas.mesh_displacement=function(sx,sy,sz,anglex,angley,anglez) {
    gl.mesh_displacement = gl.mesh_displacement || new Shader('\
    attribute vec2 _texCoord;\
    varying vec2 texCoord;\
    uniform mat4 matrix;\
    uniform sampler2D displacement_map;\
    uniform vec3 strength;\
    void main() {\
        texCoord = _texCoord;\
        vec3 dis = texture2D(displacement_map, _texCoord).xyz-0.5;\
        vec4 pos=matrix * (vec4(vec3(_texCoord,0.0)+dis*strength,1.0));\
        gl_Position = pos/pos.w;\
    }');

    // generate grid mesh
    if(!this._.gridMeshUvs)
    {
      this._.gridMeshUvs=[];
      var dx=1./640.;
      var dy=1./480.;    
      for (var y=0;y<=1.0;y+=dy) {
          for (var x=0;x<=1.0;x+=dx) {        
              this._.gridMeshUvs.push(x,y);
              this._.gridMeshUvs.push(x,y-dy);
          }
      }
      gl.mesh_displacement.attributes({_texCoord:this._.gridMeshUvs},{_texCoord:2});
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
    gl.mesh_displacement.uniforms({
      matrix:matrix,
      strength: [sx,sy,sz]
    });
    
    // set shader textures
    gl.mesh_displacement.textures({displacement_map: this._.texture, texture: this.stack_pop()});

    // render 3d mesh stored in vertices,uvs to spare texture
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.frontFace(gl.CCW);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.mesh_displacement.drawArrays(gl.TRIANGLE_STRIP);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
    },true);
    // replace current texture by spare texture
    this._.spareTexture.swapWith(this._.texture);
 
    return this;
}

// src/filters/video/blend.js
canvas.blend=function(alpha,factor) {
    gl.blend = gl.blend || new Shader(null, '\
        uniform sampler2D texture;\
        uniform sampler2D texture1;\
        uniform float alpha;\
        uniform float factor;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color  = texture2D(texture , texCoord);\
            vec4 color1 = texture2D(texture1, texCoord);\
            gl_FragColor = mix(color, color1, alpha) * factor;\
        }\
    ');

    gl.blend.textures({texture: this._.texture, texture1: this.stack_pop()});
    this.simpleShader( gl.blend, { alpha: alpha, factor: factor ? factor : 1.0 });

    return this;
}

// src/filters/video/kaleidoscope.js
canvas.kaleidoscope=function(sides,angle,angle2) {
    gl.kaleidoscope = gl.kaleidoscope || new Shader(null, '\
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

    this.simpleShader( gl.kaleidoscope, {sides:Math.round(sides), angle:angle, angle2:angle2});

    return this;
}


canvas.mandelbrot=function(x,y,scale,angle,iterations) {

    iterations=Math.min(15,Math.abs(iterations));

    // use a single shader.
    // another implementation used one shaderi source per int(iterations), but Odroid XU4 crashed on that. On U3, it was fine.
    gl.mandelbrot = gl.mandelbrot || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec4 xform;\
        uniform vec2 center;\
        uniform float iterations; \
        varying vec2 texCoord;\
        mat2 mat=mat2(xform.xy,xform.zw);\
        void main() {\
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

    this.simpleShader( gl.mandelbrot, {
        xform: [
           Math.cos(angle)*scale, Math.sin(angle)*scale,
          -Math.sin(angle)*scale, Math.cos(angle)*scale
        ],
        iterations  : iterations,
        center: [x-this.width/2,y-this.height/2], // TODO remove this fix to cope with UI values top-left origin
        texSize: [this.width, this.height]
    });

    return this;
}

canvas.julia=function(cx,cy,x,y,scale,angle,iterations) {

    iterations=Math.min(15,Math.abs(iterations));

    // use a single shader.
    // another implementation used one shaderi source per int(iterations), but Odroid XU4 crashed on that. On U3, it was fine.
    gl.julia = gl.julia || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec4 xform;\
        uniform vec2 center;\
        uniform vec2 c;\
        uniform float iterations; \
        varying vec2 texCoord;\
        mat2 mat=mat2(xform.xy,xform.zw);\
        void main() {\
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

    this.simpleShader( gl.julia, {
        xform: [
           Math.cos(angle)*scale, Math.sin(angle)*scale,
          -Math.sin(angle)*scale, Math.cos(angle)*scale
        ],
        iterations  : iterations,
        c: [cx,cy], 
        center: [x-this.width/2,y-this.height/2], // TODO remove this fix to cope with UI values top-left origin
        texSize: [this.width, this.height]
    });

    return this;
}


// src/filters/video/relief.js
canvas.relief=function(scale2,scale4) {
      gl.getExtension('OES_standard_derivatives');
      gl.relief = gl.relief || new Shader(null,'\n\
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
      this.simpleShader( gl.reaction_blur, { delta: [d/this.width, d/this.height]});
      
      for(var s=0; s<2; s++)
        if(!textures[s] && d>scales[s])
          textures[s]=this.stack_push();          
    }
    for(var s=0; s<=2; s++)
      this.stack_pop();
      
    gl.relief.textures({
        texture: texture,
        texture_blur2: textures[0],
        texture_blur4: textures[1]
    });    
    
    this.simpleShader( gl.relief, {
        texSize: [1./this.width,1./this.height],
    },texture);

    return this;
}


// src/filters/video/transform.js
canvas.transform=function(x,y,scale,angle) {
    gl.transform = gl.transform || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 translation;\
        uniform vec4 xform;\
        varying vec2 texCoord;\
        uniform vec2 aspect;\
        void main() {\
          mat2 mat=mat2(xform.xy,xform.zw);\
          vec2 uv=(mat*(texCoord*aspect+translation-vec2(0.5,0.5))+vec2(0.5,0.5))/aspect; \
          if(uv.x>=0. && uv.y>=0. && uv.x<=1. && uv.y<=1.) \
            gl_FragColor = texture2D(texture,uv);\
          else \
            gl_FragColor = vec4(0.,0.,0.,0.); \
        }\
    ');
    
    this.simpleShader( gl.transform, {
      translation: [x,y],
      xform: [
         Math.cos(angle)/scale, Math.sin(angle)/scale,
        -Math.sin(angle)/scale, Math.cos(angle)/scale
      ],
      aspect:[this.width/this.height,1.]
    });

    return this;
}


// src/filters/video/analogize.js
canvas.analogize=function(exposure,gamma,glow,radius) {
    gl.analogize = gl.analogize || new Shader(null,'\
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
    this._.extraTexture.ensureFormat(this._.texture);
    this._.texture.copyTo(this._.extraTexture);

    this.blur(radius);

    gl.analogize.textures({
        glow_texture: this._.texture,
        texture: this._.extraTexture
    });
    this.simpleShader( gl.analogize, {
        Glow: glow,
        Exposure: exposure,
        Gamma: gamma
    });

    return this;
}


// src/filters/video/noalpha.js
canvas.noalpha=function() {
    gl.noalpha = gl.noalpha || new Shader(null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = vec4(color.rgb,1.);\
        }\
    ');
    this.simpleShader( gl.noalpha, {});
    return this;
}

// src/filters/video/preview.js
canvas.preview=function()
{
    this.preview_width=320; this.preview_height=200;
    this._.texture.use();
    gl.viewport(0,0,this.preview_width,this.preview_height);
    this._.flippedShader.drawRect();
    gl.viewport(0,0,this.width,this.height);

    return this;
}



// src/filters/video/feedbackOut.js
canvas.feedbackOut=function(blend) {
    gl.feedbackOut = gl.feedbackOut || new Shader(null, '\
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

    gl.feedbackOut.textures({
        texture: this._.texture,
        feedbackTexture: this._.feedbackTexture
    });
    this.simpleShader( gl.feedbackOut, {
        blend: blend
    });

    return this;
}

// src/filters/video/motion.js
canvas.motion=function(threshold,interval,damper) {
    gl.motionBlend = gl.motionBlend || new Shader(null, '\
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

    gl.motion = gl.motion || new Shader(null, '\
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

    var t=this._.texture;
    if(!this._.motionTexture) 
      this._.motionTexture=new Texture(t.width,t.height,t.format,t.type);
    this._.motionTexture.ensureFormat(this._.texture);

    if(!this._.motionCycle || this._.motionCycle>interval)
    {
      // blend current image into mean motion texture
      gl.motionBlend.textures({
          texture: this._.texture,
          motionTexture: this._.motionTexture
      });
      this.simpleShader( gl.motionBlend, {
          blend: damper
      },this._.texture,this._.motionTexture);

      this._.motionCycle=0;
    }
    this._.motionCycle++;

    // rebind, motionTexture was exchanged by simpleShader
    gl.motion.textures({
        texture: this._.texture,
        motionTexture: this._.motionTexture
    });
    this.simpleShader( gl.motion, {
        threshold: threshold
    });

    return this;
}

// src/filters/video/reaction.js
canvas.reaction=function(noise_factor,zoom_speed,scale1,scale2,scale3,scale4) {

    gl.getExtension('OES_standard_derivatives');

    gl.reaction_blur = gl.reaction_blur || new Shader(null, '\
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
    
    gl.reaction = gl.reaction || new Shader(null,'\n\
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
      this.simpleShader( gl.reaction_blur, { delta: [d/this.width, d/this.height]});
      
      for(var s=0; s<4; s++)
        if(!textures[s] && d>scales[s])
        {
          textures[s]=this.stack_push();          
        }
    }
    for(var s=0; s<=4; s++)
      this.stack_pop();
      
    gl.reaction.textures({
        texture: texture,
        texture_blur: textures[0],
        texture_blur2: textures[1],
        texture_blur3: textures[2],
        texture_blur4: textures[3]
    });    
    
    this.simpleShader( gl.reaction, {
        texSize: [1./this.width,1./this.height],
        rnd: [Math.random(),Math.random(),Math.random(),Math.random()],
        noise_factor: noise_factor,
        zoom_speed: zoom_speed
    },texture);

    return this;
}



// src/filters/video/displacement.js
canvas.reaction2=function(F,K,D_a,D_b,iterations) {
    iterations=Math.floor(Math.min(iterations,100.));
    gl.reaction2 = gl.reaction2 || new Shader(null, '\
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

    this._.texture.use(0);
    for(var i=0; i<iterations; i++)
      this.simpleShader( gl.reaction2, {F:F,K:K,D_a:D_a,D_b:D_b, scale: [this.width,this.height] });

    return this;
}


// src/filters/video/displacement.js
canvas.displacement=function(strength) {
    gl.displacement = gl.displacement || new Shader(null, '\
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

    gl.displacement.textures({displacement_map: this._.texture, texture: this.stack_pop()});
    this.simpleShader( gl.displacement, { strength: strength });

    return this;
}

// src/filters/video/gauze.js
canvas.gauze=function(fx,fy,angle,amplitude,x,y) {

    gl.gauze = gl.gauze || new Shader(null, '\
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

    this.simpleShader( gl.gauze, {
        xform: [
           Math.cos(angle)*fx, Math.sin(angle)*fy,
          -Math.sin(angle)*fx, Math.cos(angle)*fy
        ],
        amplitude: amplitude,
        center: [x-this.width/2,y-this.height/2], // TODO remove this fix to cope with UI values top-left origin
        texSize: [this.width, this.height]
    });

    return this;
}


// src/filters/video/waveform.js
canvas.waveform=function()
{
    var values=audio_engine.waveform;
    if(!values) return;
    
    if(!this._.waveformTexture)
      this._.waveformTexture=new Texture(values.length,1,gl.LUMINANCE,gl.UNSIGNED_BYTE);
      
    this._.waveformTexture.load(values);
    this._.waveformTexture.copyTo(this._.texture);
        
    return this;
}

// src/filters/video/lumakey.js
canvas.lumakey=canvas.luma_key=function(threshold,feather) {
    gl.lumakey = gl.lumakey || new Shader(null, '\
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

    gl.lumakey.textures({texture: this._.texture, texture1: this.stack_pop()});
    this.simpleShader( gl.lumakey, { threshold: threshold, feather: feather });

    return this;
}

// src/filters/video/colorkey.js
canvas.colorkey=canvas.chroma_key=function(r,g,b,threshold,feather) {
    gl.colorkey = gl.colorkey || new Shader(null, '\
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

    gl.colorkey.textures({texture: this._.texture, texture1: this.stack_pop()});
    this.simpleShader( gl.colorkey, { key_color:[r,g,b], threshold: threshold, feather: feather });

    return this;
}

// src/filters/video/life.js
canvas.life=function() {
    gl.life = gl.life || new Shader(null, '\
      uniform sampler2D texture;\
      uniform vec2 texSize;\
      varying vec2 texCoord;\
\
      float cell(float x, float y){\
	      float f=dot(texture2D(texture,vec2(x,y)),vec4(.33,.33,.33,0.));\
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

    this.simpleShader( gl.life, {texSize: [this.width, this.height]});

    return this;
}


// src/filters/video/polygon.js
canvas.polygon=function(sides,x,y,size,angle,aspect) {

    aspect=aspect || 1.;
    
    gl.polygon = gl.polygon || new Shader(null, '\
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

    this.simpleShader( gl.polygon, {
        size:[size*this.height/this.width,size*aspect],
        sides:Math.floor(sides),
        angle:angle,
        center: [x,y]
    });

    return this;
}


// src/filters/video/timeshift.js
canvas.timeshift=function(time)
{
    // Store a stream of the last second in a ring buffer

    var max_frames=25;
    
    if(!this._.pastTextures) this._.pastTextures=[];

    var t=this._.texture;
    if(this._.pastTextures.length<max_frames)
      this._.pastTextures.push(new Texture(t.width,t.height,t.format,t.type));
    
    // copy current frame to the start of the queue, pushing all frames back
    var nt=this._.pastTextures.pop();
    nt.ensureFormat(this._.texture);
    this._.texture.copyTo(nt);
    this._.pastTextures.unshift(nt);

    // copy past frame from the queue to the current texture, if available
    var j=Math.abs(Math.floor(time) % max_frames);
    if(this._.pastTextures[j]) 
    {
      this._.pastTextures[j].copyTo(this._.texture);
    }

    return this;
}

// src/filters/video/capture.js
canvas.capture=function(source_index)
{
    source_index=Math.floor(source_index);    
    var v=this.video_source(source_index);
    
    // make sure the video has adapted to the capture source
    if(!v || v.currentTime==0 || !v.videoWidth) return this; 
    
    if(!this._.videoTexture) this._.videoTexture=this.texture(v);    
    this._.videoTexture.loadContentsOf(v);
//    this.draw(this._.videoTexture);
    this._.videoTexture.copyTo(this._.texture);
        
    return this;
}

// src/filters/video/rainbow.js
canvas.rainbow=function(size, angle) {
    gl.rainbow = gl.rainbow || new Shader(null, '\
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

    this.simpleShader( gl.rainbow, {});

    return this;
}

// src/filters/video/grid.js
/**
 * @filter         Grid
 * @description    Adds a grid to the image
 */
canvas.grid=function(size, angle) {
    gl.grid = gl.grid || new Shader(null, '\
        uniform sampler2D texture;\
      	uniform float size;\
      	uniform float angle;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            vec2 uv=texCoord*vec2(size,size);\
            uv=vec2(cos(angle)*uv.x+sin(angle)*uv.y,-sin(angle)*uv.x+cos(angle)*uv.y);\
            \
            if     (fract(uv.x*8.+.02)<.04 || fract(uv.y*8.+.02)<.04)\
	            gl_FragColor = vec4(0.0,0.0,0.0,1.0);\
            else if(fract(uv.x*8.+.05)<.1 || fract(uv.y*8.+.05)<.1)\
	            gl_FragColor = vec4(1.0,1.0,1.0,1.0);\
            else\
	            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( gl.grid, {size: size, angle:angle
    });

    return this;
}

// src/filters/video/absolute.js
canvas.absolute=function(size, angle) {
    gl.absolute = gl.absolute || new Shader(null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          vec3 abs_rgb  = abs(rgba.rgb-vec3(0.5))*2.0; \
          gl_FragColor = vec4(abs_rgb,rgba.a);\
        }\
    ');

    this.simpleShader( gl.absolute, {});

    return this;
}

// src/filters/video/denoisefast.js
/**
 * @filter         Denoise Fast
 * @description    Smooths over grainy noise in dark images using an 9x9 box filter
 *                 weighted by color intensity, similar to a bilateral filter.
 * @param exponent The exponent of the color intensity difference, should be greater
 *                 than zero. A value of zero just gives an 9x9 box blur and high values
 *                 give the original image, but ideal values are usually around 10-100.
 */
canvas.denoisefast=function(exponent) {
    // Do a 3x3 bilateral box filter
    gl.denoisefast = gl.denoisefast || new Shader(null, '\
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
        this.simpleShader( gl.denoisefast, {
            exponent: Math.max(0, exponent),
            texSize: [this.width, this.height]
        });
    }

    return this;
}

// src/filters/video/spectrogram.js
canvas.spectrogram=function()
{
    var values=audio_engine.spectrogram;
    if(!values) return;
    
    if(!this._.spectrogramTexture)
      this._.spectrogramTexture=new Texture(values.length,1,gl.LUMINANCE,gl.UNSIGNED_BYTE);
      
    this._.spectrogramTexture.load(values);
    this._.spectrogramTexture.copyTo(this._.texture);
        
    return this;
}

// src/filters/video/smoothlife.js
canvas.smoothlife=function(birth_min,birth_max,death_min) {
    gl.smoothlife = gl.smoothlife || new Shader(null, '\
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

    this.simpleShader( gl.smoothlife, {
      birth_min:birth_min,
      birth_max:birth_max,
      death_min:death_min,
      texSize: [this.width, this.height]
    });

    return this;
}

canvas.soft_life=function(birth_min,birth_max,death_min) {
    gl.soft_life = gl.soft_life || new Shader(null, '\
      uniform sampler2D inner_texture;\
      uniform sampler2D outer_texture;\
      varying vec2 texCoord;\
      uniform float birth_min;\
      uniform float birth_max;\
      uniform float death_min;\
      \
      void main(void){\
        vec3 inner=texture2D(inner_texture,texCoord).rgb;\
        vec3 outer=texture2D(outer_texture,texCoord).rgb-inner/4.;\
        vec3 birth=smoothstep(birth_min-.05,birth_min+.05,outer)*(vec3(1.)-smoothstep(birth_max-.05,birth_max+.05,outer));\
        vec3 death=smoothstep(death_min-.05,death_min+.05,outer);\
        vec3 value=mix(birth,vec3(1.)-death,smoothstep(.45,.55,inner));\
        value=clamp(value,0.0,1.0);\
        gl_FragColor = vec4(value, 1.);\
      }\
    ');

    this.blur(1.);
    var inner_texture=this.stack_push();
    this.blur(2.);

    this.stack_pop();
        
    gl.soft_life.textures({inner_texture: inner_texture, outer_texture: this._.texture});
    
    this.simpleShader( gl.soft_life, {
      birth_min:birth_min,
      birth_max:birth_max,
      death_min:death_min,
    });

    return this;
}


// src/filters/video/particle_displacement.js
canvas.particles=function(anglex,angley,anglez,size,strength,homing,noise,displacement) {
    gl.particles = gl.particles || new Shader('\
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

    gl.particle_update = gl.particle_update || new Shader(null,'\
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
      gl.particles.attributes({_texCoord:this._.particleUvs},{_texCoord:2});
      
      // generate particle data double buffer
      if ( !gl.getExtension( 'OES_texture_float' ) ) alert( 'Float textures not supported' );
      if(!this._.particleTextureA) {
        this._.particleTextureA=new Texture(w,h, gl.RGBA, gl.FLOAT);
        this._.particleTextureB=new Texture(w,h, gl.RGBA, gl.FLOAT);
      }
    }
    
    this._.particleTextureB.swapWith(this._.particleTextureA);

    gl.particle_update.uniforms({
      homing:homing,
      noise:noise,
      displacement:displacement
    });             
    var texture=this.stack_pop();
    gl.particle_update.textures({displacement_texture: texture, texture: this._.particleTextureB});
        
    this._.particleTextureA.drawTo(function() { gl.particle_update.drawRect(); });

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
    gl.particles.uniforms({
      matrix:matrix,
      strength:strength,
      size:size
    });
    
    // set shader textures    
    gl.particles.textures({particles: this._.particleTextureA, texture: this._.texture});

    // render 3d mesh stored in vertices,uvs to spare texture
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.particles.drawArrays(gl.POINTS);
        gl.disable(gl.DEPTH_TEST);
    },true);
    // replace current texture by spare texture
    this._.spareTexture.swapWith(this._.texture);
 
    return this;
}

// src/filters/video/stack.js
canvas.stack_push=function(from_texture)
{
  // push given or current image onto stack
  if(!from_texture) from_texture=this._.texture;


  // add another texture to empty stack pool if needed
  var t=this._.texture;
  if(!this._.stackUnused.length)
    this._.stackUnused.push(new Texture(t.width,t.height,t.format,t.type));
  
  // check for stack overflow
  if(this._.stack.length>10) 
  {
    console.log('glfx.js video stack overflow!');
    return this;
  }
  
  // copy current frame on top of the stack
  var nt=this._.stackUnused.pop();
  nt.ensureFormat(from_texture);
  from_texture.copyTo(nt);
  this._.stack.push(nt);

  return nt;
}

canvas.stack_pop=function(to_texture)
{
  var texture=this._.stack.pop();
  if(!texture)
  {
    console.log('glfx.js video stack underflow!');
    return this._.texture;
  }
  this._.stackUnused.push(texture);
  
  if(to_texture) 
  {
    texture.swapWith(to_texture);
    return null;
  }
  
  return texture;
}

canvas.stack_swap=function()
{
  // exchange topmost stack element with current texture
  if(this._.stack.length<1) return;  
  this._.texture.swapWith(this._.stack[this._.stack.length-1]);
}

canvas.stack_prepare=function()
{
  // check stack

  // make sure the stack is there
  if(!this._.stack) this._.stack=[];
  if(!this._.stackUnused) this._.stackUnused=[];

  // report if stack is still full
  if(this._.stack.length)
    console.log("glfx.js video stack leaks "+this._.stack.length+" elements.");

  // pop any remaining elements
  while(this._.stack.length)
    this._.stackUnused.push(this._.stack.pop());
}



// src/filters/video/patch_displacement.js
canvas.patch_displacement=function(sx,sy,sz,anglex,angley,anglez,scale,pixelate) {
    gl.patch_displacement = gl.patch_displacement || new Shader('\
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
      gl.patch_displacement.attributes({vertex: this._.gridPatchesVertices,_texCoord:this._.gridPatchesUvs},{vertex: 3, _texCoord:2});
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
    gl.patch_displacement.uniforms({
      matrix:matrix,
      strength: [sx,sy,sz],
      scale: scale,
      pixelate:pixelate
    });
    
    // set shader textures
    gl.patch_displacement.textures({displacement_map: this._.texture, texture: this.stack_pop()});

    // render 3d mesh stored in vertices,uvs to spare texture
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.patch_displacement.drawArrays(gl.TRIANGLES);
        gl.disable(gl.DEPTH_TEST);
    },true);
    // replace current texture by spare texture
    this._.spareTexture.swapWith(this._.texture);
 
    return this;
}

// src/filters/warp/perspective.js
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
canvas.perspective=function(before, after,use_texture_space) {
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
    return this.matrixWarp(d,false,use_texture_space);
}

// src/filters/warp/matrixwarp.js
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
canvas.matrixWarp=function(matrix, inverse, useTextureSpace) {
    gl.matrixWarp = gl.matrixWarp || warpShader('\
        uniform mat3 matrix;\
        uniform float useTextureSpace;\
    ', '\
        if (useTextureSpace>0.) coord = coord / texSize * 2.0 - 1.0;\
        vec3 warp = matrix * vec3(coord, 1.0);\
        coord = warp.xy / warp.z;\
        if (useTextureSpace>0.) coord = (coord * 0.5 + 0.5) * texSize;\
    ');

    this.simpleShader( gl.matrixWarp, {
        matrix: inverse ? getInverse(matrix) : matrix,
        texSize: [this.width, this.height],
        useTextureSpace: useTextureSpace | 0
    });

    return this;
}

// src/filters/warp/swirl.js
/**
 * @filter        Swirl
 * @description   Warps a circular region of the image in a swirl.
 * @param centerX The x coordinate of the center of the circular region.
 * @param centerY The y coordinate of the center of the circular region.
 * @param radius  The radius of the circular region.
 * @param angle   The angle in radians that the pixels in the center of
 *                the circular region will be rotated by.
 */
canvas.swirl=function(centerX, centerY, radius, angle) {
    gl.swirl = gl.swirl || warpShader('\
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

    this.simpleShader( gl.swirl, {
        radius: radius,
        center: [centerX, centerY],
        angle: angle,
        texSize: [this.width, this.height]
    });

    return this;
}

// src/filters/warp/bulgepinch.js
/**
 * @filter         Bulge / Pinch
 * @description    Bulges or pinches the image in a circle.
 * @param centerX  The x coordinate of the center of the circle of effect.
 * @param centerY  The y coordinate of the center of the circle of effect.
 * @param radius   The radius of the circle of effect.
 * @param strength -1 to 1 (-1 is strong pinch, 0 is no effect, 1 is strong bulge)
 */
canvas.bulgePinch=function(centerX, centerY, radius, strength) {
    gl.bulgePinch = gl.bulgePinch || warpShader('\
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

    this.simpleShader( gl.bulgePinch, {
        radius: radius,
        strength: clamp(-1, strength, 1),
        center: [centerX, centerY],
        texSize: [this.width, this.height]
    });

    return this;
}

// src/filters/blur/zoomblur.js
/**
 * @filter         Zoom Blur
 * @description    Blurs the image away from a certain point, which looks like radial motion blur.
 * @param centerX  The x coordinate of the blur origin.
 * @param centerY  The y coordinate of the blur origin.
 * @param strength The strength of the blur. Values in the range 0 to 1 are usually sufficient,
 *                 where 0 doesn't change the image and 1 creates a highly blurred image.
 */
canvas.zoomBlur=function(centerX, centerY, strength) {
    gl.zoomBlur = gl.zoomBlur || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
        uniform float strength;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        ' + randomShaderFunc + '\
        void main() {\
            vec4 color = vec4(0.0);\
            float total = 0.0;\
            vec2 toCenter = center - texCoord * texSize;\
            \
            /* randomize the lookup values to hide the fixed number of samples */\
            float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);\
            \
            for (float t = 0.0; t <= 40.0; t++) {\
                float percent = (t + offset) / 40.0;\
                float weight = 4.0 * (percent - percent * percent);\
                vec4 sample = texture2D(texture, texCoord + toCenter * percent * strength / texSize);\
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

    this.simpleShader( gl.zoomBlur, {
        center: [centerX, centerY],
        strength: strength,
        texSize: [this.width, this.height]
    });

    return this;
}

// src/filters/blur/dilate.js
canvas.dilate=function(iterations) {
    gl.dilate = gl.dilate || new Shader(null, '\
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
      this.simpleShader( gl.dilate, {texSize: [this.width, this.height]});

    return this;
}

// src/filters/blur/localcontrast.js
/**
 * @filter       Fast Blur
 * @description  This is the most basic blur filter, which convolves the image with a
 *               pyramid filter. The pyramid filter is separable and is applied as two
 *               perpendicular triangle filters.
 * @param radius The radius of the pyramid convolved with the image.
 */
canvas.localContrast=function(radius,strength) {
    gl.localContrastMin = gl.localContrastMin || new Shader(null, '\
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
    gl.localContrastMax = gl.localContrastMax || new Shader(null, '\
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
    gl.localContrast = gl.localContrast || new Shader(null, '\
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
    
    this.blur(radius);    
    var min_image=this.stack_push();
    var max_image=this.stack_push();

    var steps=radius/2;
    var delta=Math.sqrt(radius);

    for(var i=0; i<steps; i++)
      this.simpleShader( gl.localContrastMin, { delta: [delta/this.width, delta/this.height]}, min_image, min_image);

    for(var i=0; i<steps; i++)
      this.simpleShader( gl.localContrastMax, { delta: [delta/this.width, delta/this.height]},max_image, max_image);

  
    gl.localContrast.textures({min_texture:min_image, max_texture:max_image});
    this.simpleShader( gl.localContrast, {strength:strength},original_image);
    
    this.stack_pop();
    this.stack_pop();    
    this.stack_pop();
  
    return this;
}


// src/filters/blur/erode.js
canvas.erode=function(iterations) {
    gl.erode = gl.erode || new Shader(null, '\
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
      this.simpleShader( gl.erode, {texSize: [this.width, this.height]});

    return this;
}

canvas.blur=function(radius) {
    gl.blur = gl.blur || new Shader(null, '\
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
      this.simpleShader( gl.blur, { delta: [d/this.width, d/this.height]});
    }
    return this;
}

canvas.fastBlur=canvas.blur; // legacy name for old filter chains

canvas.blur2=function(radius,exponent) {
    gl.blur2 = gl.blur2 || new Shader(null, '\
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
      this.simpleShader( gl.blur2, { exponent: exponent, delta: [d/this.width, d/this.height]});
    }
    return this;
}


// src/filters/adjust/unsharpmask.js
/**
 * @filter         Unsharp Mask
 * @description    A form of image sharpening that amplifies high-frequencies in the image. It
 *                 is implemented by scaling pixels away from the average of their neighbors.
 * @param radius   The blur radius that calculates the average of the neighboring pixels.
 * @param strength A scale factor where 0 is no effect and higher values cause a stronger effect.
 */
canvas.unsharpMask=function(radius, strength) {
    gl.unsharpMask = gl.unsharpMask || new Shader(null, '\
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
    this._.extraTexture.ensureFormat(this._.texture);
    this._.texture.copyTo(this._.extraTexture);

    // Blur the current texture, then use the stored texture to detect edges
    this.blur(radius);
    gl.unsharpMask.textures({
        blurredTexture: this._.texture,
        originalTexture: this._.extraTexture
    });
    this.simpleShader( gl.unsharpMask, {
        strength: strength
    });

    return this;
}

// src/filters/adjust/noise.js
/**
 * @filter         Noise
 * @description    Adds black and white noise to the image.
 * @param amount   0 to 1 (0 for no effect, 1 for maximum noise)
 */
canvas.noise=function(amount) {
    gl.noise = gl.noise || new Shader(null, '\
        uniform sampler2D texture;\
        uniform float amount;\
        varying vec2 texCoord;\
        float rand(vec2 co) {\
            return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);\
        }\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            \
            float diff = (rand(texCoord) - 0.5) * amount;\
            color.r += diff;\
            color.g += diff;\
            color.b += diff;\
            \
            gl_FragColor = color;\
        }\
    ');

    this.simpleShader( gl.noise, {
        amount: clamp(0, amount, 1)
    });

    return this;
}

// src/filters/adjust/color.js
/**
 * @filter           Color
 * @description      Give more or less importance to a color
 * @param alpha      0 to 1 Importance of the color modification
 * @param r          0 to 1 Importance of the Red Chanel modification
 * @param g          0 to 1 Importance of the Green Chanel modification
 * @param b          0 to 1 Importance of the Blue Chanel modification
 */
canvas.color=function(alpha,r,g,b) {
    gl.color = gl.color || new Shader(null, '\
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

    this.simpleShader( gl.color, {
       r  : r,
       g  : g,
       b  : b,
       a  : alpha
    });

    return this;
}
// src/filters/adjust/denoise.js
/**
 * @filter         Denoise
 * @description    Smooths over grainy noise in dark images using an 9x9 box filter
 *                 weighted by color intensity, similar to a bilateral filter.
 * @param exponent The exponent of the color intensity difference, should be greater
 *                 than zero. A value of zero just gives an 9x9 box blur and high values
 *                 give the original image, but ideal values are usually around 10-20.
 */
canvas.denoise=function(exponent) {
    // Do a 9x9 bilateral box filter
    gl.denoise = gl.denoise || new Shader(null, '\
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
        this.simpleShader( gl.denoise, {
            exponent: Math.max(0, exponent),
            texSize: [this.width, this.height]
        });
    }

    return this;
}



// src/filters/adjust/vibrance.js
/**
 * @filter       Vibrance
 * @description  Modifies the saturation of desaturated colors, leaving saturated colors unmodified.
 * @param amount -1 to 1 (-1 is minimum vibrance, 0 is no change, and 1 is maximum vibrance)
 */
canvas.vibrance=function(amount) {
    gl.vibrance = gl.vibrance || new Shader(null, '\
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

    this.simpleShader( gl.vibrance, {
        amount: clamp(-1, amount, 1)
    });

    return this;
}

// src/filters/adjust/curves.js
canvas.splineInterpolate=function(points) {
    var interpolator = new SplineInterpolator(points);
    var array = [];
    for (var i = 0; i < 256; i++) {
        array.push(clamp(0, Math.floor(interpolator.interpolate(i / 255) * 256), 255));
    }
    return array;
}


// TODO integrate...
/**
 * @filter      Curves
 * @description A powerful mapping tool that transforms the colors in the image
 *              by an arbitrary function. The function is interpolated between
 *              a set of 2D points using splines. The curves filter can take
 *              either one or three arguments which will apply the mapping to
 *              either luminance or RGB values, respectively.
 * @param red   A list of points that define the function for the red channel.
 *              Each point is a list of two values: the value before the mapping
 *              and the value after the mapping, both in the range 0 to 1. For
 *              example, [[0,1], [1,0]] would invert the red channel while
 *              [[0,0], [1,1]] would leave the red channel unchanged. If green
 *              and blue are omitted then this argument also applies to the
 *              green and blue channels.
 * @param green (optional) A list of points that define the function for the green
 *              channel (just like for red).
 * @param blue  (optional) A list of points that define the function for the blue
 *              channel (just like for red).
 */
canvas.curves=function(red, green, blue) {
    // Create the ramp texture
    red = splineInterpolate(red);
    if (arguments.length == 1) {
        green = blue = red;
    } else {
        green = splineInterpolate(green);
        blue = splineInterpolate(blue);
    }
    var array = [];
    for (var i = 0; i < 256; i++) {
        array.splice(array.length, 0, red[i], green[i], blue[i], 255);
    }
    this._.extraTexture.initFromBytes(256, 1, array);

    gl.curves = gl.curves || new Shader(null, '\
        uniform sampler2D texture;\
        uniform sampler2D map;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            color.r = texture2D(map, vec2(color.r)).r;\
            color.g = texture2D(map, vec2(color.g)).g;\
            color.b = texture2D(map, vec2(color.b)).b;\
            gl_FragColor = color;\
        }\
    ');

    gl.curves.textures({
        texture:this._.texture,
        map: this._.extraTexture
    });
    this.simpleShader( gl.curves, {});

    return this;
}

// src/filters/adjust/levels.js
// min:0.0,gamma:1.0,max:1.0, r_min:0.0,g_min:0.0,b_min:0.0, r_gamma:1.0,g_gamma:1.0,b_gamma:1.0, r_max:1.0,g_max:1.0,b_max:1.0
canvas.levels=function(min,gamma,max, r_min,g_min,b_min, r_gamma,g_gamma,b_gamma, r_max,g_max,b_max) {
    gl.levels = gl.levels || new Shader(null, '\
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

    this.simpleShader( gl.levels, {
        rgb_min:[r_min+min,g_min+min,b_min+min],
        rgb_gamma:[r_gamma*gamma,g_gamma*gamma,b_gamma*gamma],
        rgb_max:[r_max+max-1.,g_max+max-1.,b_max+max-1.]
    });

    return this;
}

// src/filters/adjust/huesaturation.js
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
canvas.hueSaturation=function(hue, saturation) {
    gl.hueSaturation = gl.hueSaturation || new Shader(null, '\
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

    this.simpleShader( gl.hueSaturation, {
        hue: clamp(-1, hue, 1),
        saturation: clamp(-1, saturation, 1)
    });

    return this;
}

// src/filters/adjust/brightnesscontrast.js
/**
 * @filter           Brightness / Contrast
 * @description      Provides additive brightness and multiplicative contrast control.
 * @param brightness -1 to 1 (-1 is solid black, 0 is no change, and 1 is solid white)
 * @param contrast   -1 to 1 (-1 is solid gray, 0 is no change, and 1 is maximum contrast)
 */
canvas.brightnessContrast=function(brightness, contrast) {
    gl.brightnessContrast = gl.brightnessContrast || new Shader(null, '\
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

    this.simpleShader( gl.brightnessContrast, {
        brightness: clamp(-1, brightness, 1),
        contrast: clamp(-1, contrast, 1)
    });

    return this;
}

// src/filters/fun/sobel.js
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

canvas.sobel=function(secondary, coef, alpha, r,g,b,a, r2,g2,b2, a2) {
    gl.sobel = gl.sobel || new Shader(null, '\
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

    this.simpleShader( gl.sobel, {
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

// src/filters/fun/posterize.js

canvas.posterize=function(steps) {
    gl.posterize = gl.posterize || new Shader(null, '\
        uniform sampler2D texture;\
        uniform float steps;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            gl_FragColor = vec4(floor(color.rgb*(steps+vec3(1.)))/steps, color.a);\
        }\
    ');

    this.simpleShader( gl.posterize, { steps: Math.round(steps) });

    return this;
}


canvas.posterize_hue=function(hue,brightness) {
    gl.posterize_hue = gl.posterize_hue || new Shader(null, '\
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

    this.simpleShader( gl.posterize_hue, { hue: Math.round(hue), brightness: Math.round(brightness) });

    return this;
}



// src/filters/fun/hexagonalpixelate.js
/**
 * @filter        Hexagonal Pixelate
 * @description   Renders the image using a pattern of hexagonal tiles. Tile colors
 *                are nearest-neighbor sampled from the centers of the tiles.
 * @param centerX The x coordinate of the pattern center.
 * @param centerY The y coordinate of the pattern center.
 * @param scale   The width of an individual tile, in pixels.
 */
canvas.hexagonalPixelate=function(centerX, centerY, scale) {
    gl.hexagonalPixelate = gl.hexagonalPixelate || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 center;\
        uniform float scale;\
        uniform vec2 texSize;\
        varying vec2 texCoord;\
        void main() {\
            vec2 tex = (texCoord * texSize - center) / scale;\
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
            choice *= scale / texSize;\
            gl_FragColor = texture2D(texture, choice + center / texSize);\
        }\
    ');

    this.simpleShader( gl.hexagonalPixelate, {
        center: [centerX, centerY],
        scale: scale,
        texSize: [this.width, this.height]
    });

    return this;
}

canvas.pixelate=function(x1,y1,x2,y2) {
    gl.pixelate = gl.pixelate || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 v1;\
        uniform vec2 v2;\
        uniform vec2 v3;\
        varying vec2 texCoord;\
        vec2 snap(vec2 x, vec2 s)\
        {\
          float t=dot(x,s)/dot(s,s);\
          vec2 x1=s*(floor(t+0.5)-0.5); \
          vec2 x2=x-s*t; \
          return x1+x2;\
        }\
        void main() {\
            vec2 x=texCoord;\
            x=snap(x,v1);\
            x=snap(x,v2);\
            gl_FragColor = texture2D(texture, x);\
        }\
    ');

    this.simpleShader( gl.pixelate, {
        v1:[x1,y1],
        v2:[x2,y2]
    });

    return this;
}


// src/filters/fun/colorhalftone.js
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
canvas.colorHalftone=function(centerX, centerY, angle, size) {
    gl.colorHalftone = gl.colorHalftone || new Shader(null, '\
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

    this.simpleShader( gl.colorHalftone, {
        center: [centerX, centerY],
        angle: angle,
        scale: Math.PI / size,
        texSize: [this.width, this.height]
    });

    return this;
}

// src/filters/fun/invert.js
/**
 * @description Invert the colors!
 */

canvas.invert=function() {
    gl.invert = gl.invert || new Shader(null, '\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = texture2D(texture, texCoord);\
            color.rgb = 1.0 - color.rgb;\
            gl_FragColor = color;\
        }\
    ');
    this.simpleShader( gl.invert, {});
    return this;
}

canvas.invertColor=canvas.invert; // legacy name

canvas.glitch=function(scale,detail,strength,speed) {
    canvas.glitch_time=(canvas.glitch_time || 0.0)+0.0001*speed;
    gl.glitch = gl.glitch || new Shader(null, '\
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

    this.simpleShader( gl.glitch, {
        detail:detail,
        strength: strength,
        texSize: [this.width/scale, this.height/scale],
        time: canvas.glitch_time
    });

    return this;
}


