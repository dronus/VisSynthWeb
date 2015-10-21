function lumakey(threshold,feather) {
    gl.lumakey = gl.lumakey || new Shader(null, '\
      uniform sampler2D texture;\
      uniform sampler2D texture1;\
      uniform float threshold;\
      uniform float feather;\
      varying vec2 texCoord;\
      void main() {\
        vec4 color  = texture2D(texture , texCoord);\
        vec4 color1 = texture2D(texture1, texCoord);\
        float d=dot(color.rgb,vec3(1./3.)); \
        float alpha=clamp((d - threshold) / feather, 0.0, 1.0); \
        gl_FragColor = mix(color1, color, alpha);\
      }\
    ');

    var texture1=this.stack_pop();
    texture1.use(1);
    gl.lumakey.textures({texture: 0, texture1: 1});
    simpleShader.call(this, gl.lumakey, { threshold: threshold, feather: feather });
    texture1.unuse(1);

    return this;
}
