/**
 * @filter         Grid
 * @description    Adds a grid to the image
 */
function grid(size, angle) {
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

    simpleShader.call(this, gl.grid, {size: size, angle:angle
    });

    return this;
}
