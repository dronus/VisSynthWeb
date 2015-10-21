function patch_displacement(sx,sy,sz,anglex,angley,anglez,scale,pixelate) {
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
    this._.texture.use(0); 
    var texture=this.stack_pop();
    texture.use(1);
    gl.patch_displacement.textures({displacement_map: 0, texture: 1});

    // render 3d mesh stored in vertices,uvs to spare texture
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.patch_displacement.drawTriangles(gl.TRIANGLES);
        gl.disable(gl.DEPTH_TEST);
    },true);
    // replace current texture by spare texture
    this._.spareTexture.swapWith(this._.texture);
 
    texture.unuse(1);
     
    return this;
}
