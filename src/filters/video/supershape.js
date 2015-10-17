function supershape(angleX,angleY,a1,b1,m1,n11,n21,n31,a2,b2,m2,n12,n22,n32) {

  if(!gl.supershape)
  {
    gl.supershape = new Shader('\
      float superFormula(in float a, in float b, in float m, in float n1, in float n2, in float n3, in float phi)\
      {\
          vec2 ret;\
          float Out;\
          float t1 = cos(m * phi / 4.0);\
          t1 = t1 / a;\
          t1 = abs(t1);\
          t1 = pow(t1, n2);\
          float t2 = sin(m * phi / 4.0);\
          t2 = t2 / b;\
          t2 = abs(t2);\
          t2 = pow(t2, n3);\
          float T = t1 + t2;\
          Out = pow(T, 1.0 / n1);\
          if (abs(Out) == 0.0) {\
              Out = 0.0;\
          } else {\
              Out = 1.0 / Out;\
          }\
       \
          return Out;\
      }\
      \
      uniform float a;\
      uniform float b;\
      uniform float m;\
      uniform float n1;\
      uniform float n2;\
      uniform float n3;\
      uniform float ab;\
      uniform float bb;\
      uniform float mb;\
      uniform float n1b;\
      uniform float n2b;\
      uniform float n3b;\
      \
      attribute vec2 _texCoord;\
      varying vec2 texCoord;\
      uniform mat4 matrix;\
      \
      float PI=3.14159;\
      \
      void main()\
      {\
          vec2 uv = (_texCoord-vec2(0.5)) * vec2(2.*PI,PI);\
           \
          float rt = superFormula(a,b,m, n1, n2, n3, uv.x);\
          float rp = superFormula(ab,bb,mb, n1b, n2b, n3b, uv.y);\
          float st = sin(uv.x);\
          float ct = cos(uv.x);\
          float sp = sin(uv.y);\
          float cp = cos(uv.y);\
           \
          vec4 pos;\
          pos.x = rt * ct * rp * cp;\
          pos.z = rt * st * rp * cp;\
          pos.y = rp * sp;\
          pos.w=1.;\
                \
          texCoord = _texCoord;\
          pos=matrix*pos;\
          gl_Position = pos/pos.w;\
      }','\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          gl_FragColor = rgba;\
        }\
      ');
      var uvs=[];
      for (sv=-Math.PI/2,i=0;sv<=Math.PI/2;sv+=Math.PI/50,i++) { 
          for (su=-Math.PI,j=0;su<=Math.PI;su+=Math.PI/100,j++) { 
          
              var u=su/Math.PI/2+0.5;
              var v=sv/Math.PI+0.5;

              var sv2=sv-Math.PI/25;
              var v2=sv2/Math.PI+0.5;
          
              uvs.push(u,v);
              uvs.push(u,v2);                  
          }
      }
      gl.supershape.attributes({_texCoord:uvs},{_texCoord:2});
    }
       
    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);
    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-5.]);
    mat4.rotate(matrix,angleX,[1.0,0.0,0.0]);
    mat4.rotate(matrix,angleY,[0.0,1.0,0.0]);
    mat4.multiply(proj,matrix,matrix);
    
    var uniforms={
      a: a1, b: b1, m:m1, n1:n11, n2:n21, n3:n31,
      ab: a2, bb: b2, mb:m2, n1b:n12, n2b:n22, n3b:n32,
      matrix:matrix
    };

    var supershapeMeshUVs=this._.supershapeMeshUVs;
    this._.texture.use(0);
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); 
        gl.supershape.uniforms(uniforms).drawTriangles();
        gl.disable(gl.DEPTH_TEST);
    },true);
    this._.spareTexture.swapWith(this._.texture);
    
    return this;
}
