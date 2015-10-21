function relief(scale2,scale4) {
      gl.relief = gl.relief || new Shader(null,'\
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
        gy.x = texture2D(texture, texCoord-vec2(1.,0.)*d).y - texture2D(texture, texCoord+vec2(1.,0.)*d).y; \n\
        gy.y = texture2D(texture, texCoord-vec2(0.,1.)*d).y - texture2D(texture, texCoord+vec2(0.,1.)*d).y; \n\
       \n\
        d = texSize*4.; \n\
       \n\
        vec2 gz; // blue blur2 gradient vector \n\
        gz.x += texture2D(texture_blur2, texCoord-vec2(1.,0.)*d).z - texture2D(texture_blur2, texCoord+vec2(1.,0.)*d).z; \n\
        gz.y += texture2D(texture_blur2, texCoord-vec2(0.,1.)*d).z - texture2D(texture_blur2, texCoord+vec2(0.,1.)*d).z; \n\
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
        //gl_FragColor = texture2D(texture, texCoord); // bypass \n\
         \n\
        gl_FragColor.a = 1.;\n\
      } \n\
    ');

    var texture=this.stack_push();
    this.fastBlur(scale2);
    var blur2=this.stack_push();
    this.fastBlur(scale4);
    var blur4=this.stack_push();

    this.stack_pop();
    this.stack_pop();
    this.stack_pop();

    texture.use(0);
    blur2.use(1);
    blur4.use(2);
    gl.relief.textures({
        texture: 0,
        texture_blur2: 1,
        texture_blur4: 2
    });    
    
    simpleShader.call(this, gl.relief, {
        texSize: [1./this.width,1./this.height],
    },texture);

    blur2.unuse(2);
    blur4.unuse(4);    

    return this;
}

