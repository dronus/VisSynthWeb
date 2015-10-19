function particles(anglex,angley,anglez,size,strength,homing,noise,displacement) {
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
      gl_FragColor = vec4(rgba.rgb,rgba.a*2.*d);\
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
    texture.use(0);
    this._.particleTextureB.use(1);
    gl.particle_update.textures({displacement_texture: 0, texture: 1});
        
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
    this._.particleTextureA.use(0);
    this._.texture.use(1);

    gl.particles.textures({particles: 0, texture: 1});

    // render 3d mesh stored in vertices,uvs to spare texture
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.particles.drawTriangles(gl.POINTS);
        gl.disable(gl.DEPTH_TEST);
    },true);
    // replace current texture by spare texture
    this._.spareTexture.swapWith(this._.texture);
 
    this._.texture.unuse(1);
     
    return this;
}
