function ripple(fx,fy,angle,amplitude) {
    gl.ripple = gl.ripple || warpShader('\
        uniform vec4 xform;\
        uniform float amplitude;\
        uniform vec2 center;\
        mat2 mat=mat2(xform.xy,xform.zw);\
    ', '\
        coord -= center;\
        coord += amplitude*sin(mat*coord);\
        coord += center;\
    ');

    simpleShader.call(this, gl.ripple, {
        xform: [
           Math.cos(angle)*fx, Math.sin(angle)*fy,
          -Math.sin(angle)*fx, Math.cos(angle)*fy
        ],
        amplitude: amplitude,
        center: [this.width/2, this.height/2],
        texSize: [this.width, this.height]
    });

    return this;
}

