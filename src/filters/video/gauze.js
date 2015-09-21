function gauze(fx,fy,angle,amplitude,x,y) {

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
            gl_FragColor = vec4(color.rgb*a,color.a);\
        }\
    ');

    simpleShader.call(this, gl.gauze, {
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

