function life() {
    gl.life = gl.life || new Shader(null, '\
      uniform sampler2D texture;\
      uniform vec2 texSize;\
      varying vec2 texCoord;\
\
      float cell(float x, float y){\
	      float f=dot(texture2D(texture,vec2(x,y)),vec4(.33,.33,.33,0.));\
	      return floor(f+0.5);\
      }\
\
      void main(void){\
        float dx=1./texSize.x;\
        float dy=1./texSize.y;\
	      float x=texCoord.x;\
	      float y=texCoord.y;\
         float m=cell(x,y);\
         float l=cell(x-dx,y);\
         float r=cell(x+dx,y);\
         float u=cell(x,y-dy);\
         float d=cell(x,y+dy);\
         float ld=cell(x-dx,y+dy);\
         float ru=cell(x+dx,y-dy);\
         float lu=cell(x-dx,y-dy);\
         float rd=cell(x+dx,y+dy);\
	\
	      float num;\
	      num=l+r+u+d+ld+ru+lu+rd;\
	      float outp=m;\
	      if (m>0.){                \
		      if(num<2.) outp=0.;\
		      if(num>3.) outp=0.;\
	      } else if (num>2. && num<4.) outp=1.;\
         gl_FragColor = vec4(outp, outp, outp, 1.);\
      }\
    ');

    simpleShader.call(this, gl.life, {texSize: [this.width, this.height]});

    return this;
}

