// min:0.0,gamma:1.0,max:1.0, r_min:0.0,g_min:0.0,b_min:0.0, r_gamma:1.0,g_gamma:1.0,b_gamma:1.0, r_max:1.0,g_max:1.0,b_max:1.0
function levels(min,gamma,max, r_min,g_min,b_min, r_gamma,g_gamma,b_gamma, r_max,g_max,b_max) {
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

    simpleShader.call(this, gl.levels, {
        rgb_min:[r_min+min,g_min+min,b_min+min],
        rgb_gamma:[r_gamma+gamma,g_gamma+gamma,b_gamma+gamma],
        rgb_max:[r_max+max-1.,g_max+max-1.,b_max+max-1.]
    });

    return this;
}
