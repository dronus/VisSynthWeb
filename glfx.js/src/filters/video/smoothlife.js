function smoothlife(birth_min,birth_max,death_min) {
    gl.smoothlife = gl.smoothlife || new Shader(null, '\
      uniform sampler2D texture;\
      uniform vec2 texSize;\
      varying vec2 texCoord;\
      uniform float birth_min;\
      uniform float birth_max;\
      uniform float death_min;\
      \
      vec3 cell(float x, float y){\
        return texture2D(texture,vec2(x,y)).rgb;\
      }\
      \
      void main(void){\
        float dx=1./texSize.x;\
        float dy=1./texSize.y;\
        float cx=texCoord.x;\
        float cy=texCoord.y;\
        vec3 value=cell(cx,cy);\
        vec3 inner=vec3(0.),outer=vec3(0.);\
        float outer_r=4.5;\
        float split_r=3.5;\
        for(int y=-5; y<=5; y++)\
          for(int x=-5; x<=5; x++)\
          {\
            float r=length(vec2(x,y));\
            float a=smoothstep(split_r-.5,split_r+0.5,r);\
            float b=1.-smoothstep(outer_r-.5,outer_r+.5,r);\
            vec3 c=cell(cx+float(x)*dx,cy+float(y)*dy);\
            inner+=c*(1.-a);\
            outer+=c*a*b;\
          }\
        outer/=(outer_r*outer_r-split_r*split_r)*3.14159;\
        inner/=split_r*split_r*3.14159;\
        vec3 birth=smoothstep(birth_min-.05,birth_min+.05,outer)*(vec3(1.)-smoothstep(birth_max-.05,birth_max+.05,outer));\
        vec3 death=smoothstep(death_min-.05,death_min+.05,outer);\
        value=mix(birth,vec3(1.)-death,smoothstep(.45,.55,inner));\
        value=clamp(value,0.0,1.0);\
        gl_FragColor = vec4(value, 1.);\
      }\
    ');

    simpleShader.call(this, gl.smoothlife, {
      birth_min:birth_min,
      birth_max:birth_max,
      death_min:death_min,
      texSize: [this.width, this.height]
    });

    return this;
}

