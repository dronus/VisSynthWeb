function particle_displacement(sx,sy,sz,anglex,angley,anglez,scale,pixelate) {
    gl.particle_displacement = gl.particle_displacement || new Shader('\
    attribute vec2 _texCoord;\
    uniform sampler2D texture;\
    uniform mat4 matrix;\
    uniform sampler2D displacement_map;\
    uniform vec3 strength;\
    uniform float scale;\
    varying vec4 rgba;\
    void main() {\
        vec3 dis = texture2D(displacement_map, _texCoord).xyz-0.5;\
        vec4 pos=matrix * (vec4((vec3(_texCoord,0.0)+dis*strength)*scale,1.0));\
        gl_Position = pos/pos.w;\
        gl_PointSize=20./pos.w;\
        rgba = texture2D(texture, _texCoord);\
    }','\
    varying vec4 rgba;\
    void main() {\
      vec2 uv=gl_PointCoord;\
      float d=2.*max(0.,0.5-length(uv-vec2(0.5)));\
      gl_FragColor = vec4(rgba.rgb,rgba.a*d);\
      if(rgba.a*d<.1) discard; \
    }\
    ');

    gl.particle_update = gl.particle_update || new Shader(null,'\
        uniform sampler2D texture;\
        uniform sampler2D displacement;\
        varying vec2 texCoord;\
        void main() {\
            vec4 data = texture2D(texture, texCoord);\
            vec4 disp = texture2D(displacement, texCoord);\
            vec2 inp=(data+disp).xy+texCoord;\
            float noi=fract(sin(dot(inp ,vec2(12.9898,78.233))) * 43758.5453);\
            vec2 d=vec2(sin(noi*10.),cos(noi*10.));\
            data.xy+=d/50.;\
            gl_FragColor = vec4(data.rgb,1.0);\
        }\
    ');

    // generate grid mesh and particle data textures
    var w=160, h=100;
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
      gl.particle_displacement.attributes({_texCoord:this._.particleUvs},{_texCoord:2});
      
      // generate particle data double buffer
      if ( !gl.getExtension( 'OES_texture_float' ) ) alert( 'Float textures not supported' );
      if(!this._.particleTextureA) {
        this._.particleTextureA=new Texture(w,h, gl.RGBA, gl.FLOAT);
        this._.particleTextureB=new Texture(w,h, gl.RGBA, gl.FLOAT);
      }
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
    gl.particle_displacement.uniforms({
      matrix:matrix,
      strength: [sx,sy,sz],
      scale: scale,
    });
    
    this._.particleTextureB.swapWith(this._.particleTextureA);
         
    var texture=this.stack_pop();
    texture.use(0);
    this._.particleTextureB.use(1);
    gl.particle_update.textures({displacement: 0, texture: 1});    
    this._.particleTextureA.drawTo(function() { gl.particle_update.drawRect(); });
    
    // set shader textures    
    this._.particleTextureA.use(0);
    this._.texture.use(1);

    gl.particle_displacement.textures({displacement_map: 0, texture: 1});

    // render 3d mesh stored in vertices,uvs to spare texture
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.particle_displacement.drawTriangles(gl.POINTS);
        gl.disable(gl.DEPTH_TEST);
    },true);
    // replace current texture by spare texture
    this._.spareTexture.swapWith(this._.texture);
 
    this._.texture.unuse(1);
     
    return this;
}
