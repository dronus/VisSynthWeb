function matte(r,g,b) {
    gl.matte = gl.matte || new Shader(null, '\
        uniform vec3 color;\
        void main() {\
            gl_FragColor = vec4(color,1.);\
        }\
    ');
    simpleShader.call(this, gl.matte, {color:[r,g,b]});
    return this;
}
