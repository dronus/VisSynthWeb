function mesh_displacement(sx,sy,sz,anglex,angley,anglez) {
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
    this._.texture.use(0); 
    var texture=this.stack_pop();
    texture.use(1);
    gl.mesh_displacement.textures({displacement_map: 0, texture: 1});

    
    // render 3d mesh stored in vertices,uvs to spare texture
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.mesh_displacement.drawTriangles();
        gl.disable(gl.DEPTH_TEST);
    },true);
    // replace current texture by spare texture
    this._.spareTexture.swapWith(this._.texture);
 
    texture.unuse(1);
     
    return this;
}
