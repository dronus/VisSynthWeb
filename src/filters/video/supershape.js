function supershape(angleX,angleY,a1,b1,m1,n11,n21,n31,a2,b2,m2,n12,n22,n32) {
    gl.supershape = gl.supershape || new Shader('\
    attribute vec3 vertex;\
    attribute vec2 _texCoord;\
    varying vec2 texCoord;\
    uniform mat4 matrix;\
    void main() {\
        texCoord = _texCoord;\
        vec4 pos=matrix * (vec4(vertex,1.0));  \
        gl_Position = pos/pos.w; \
    }','\
        uniform sampler2D texture;\
        varying vec2 texCoord;\
        void main() {\
          vec4 rgba = texture2D(texture, texCoord);\
          gl_FragColor = rgba;\
        }\
    ');

  var supershape_p=function(u,v) {
      var point = [];

      var p=v;
      var s=u;

      var f, e, n, d, t, a, q, m, l, k, h;
      var c = 0;
      var o = 0;
      var u = 0;
      f = Math.cos(m1 * s / 4);
      f = 1 / a1 * Math.abs(f);
      f = Math.abs(f);
      e = Math.sin(m1 * s / 4);
      e = 1 / b1 * Math.abs(e);
      e = Math.abs(e);
      m = Math.pow(f, n21);
      l = Math.pow(e, n31);
      d = m + l;
      t = Math.abs(d);
      t = Math.pow(t, (-1 / n11));
      f = Math.cos(m2 * p / 4);
      f = 1 / a2 * Math.abs(f);
      f = Math.abs(f);
      e = Math.sin(m2 * p / 4);
      e = 1 / b2 * Math.abs(e);
      e = Math.abs(e);
      k = Math.pow(f, n22);
      h = Math.pow(e, n32);
      a = k + h;
      q = Math.abs(a);
      q = Math.pow(q, (-1 / n12));
      point.x = t * Math.cos(s) * q * Math.cos(p);
      point.y = t * Math.sin(s) * q * Math.cos(p);
      point.z = q * Math.sin(p);

      return point;
  }

    var vertices=[];
    var uvs=[];

    for (sv=-Math.PI/2,i=0;sv<=Math.PI/2;sv+=Math.PI/25,i++) { 
        for (su=-Math.PI,j=0;su<=Math.PI;su+=Math.PI/50,j++) { 
        
            var u=su/Math.PI/2+0.5;
            var v=sv/Math.PI+0.5;

            var sv2=sv-Math.PI/25;
            var v2=sv2/Math.PI+0.5;
        
            var p1 = supershape_p(su,sv);
            vertices.push(p1.x,p1.z,p1.y);
            uvs.push(u,v);

            var p2 = supershape_p(su,sv2);
            vertices.push(p2.x,p2.z,p2.y);
            uvs.push(u,v2);
                
        }
    }

    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);

    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-5.]);
    mat4.rotate(matrix,angleX,[1.0,0.0,0.0]);
    mat4.rotate(matrix,angleY,[0.0,1.0,0.0]);
    mat4.multiply(proj,matrix,matrix);
    
    var uniforms={
      matrix:matrix
    };

  
    this._.texture.use(0);
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.supershape.uniforms(uniforms).drawTriangles(vertices,uvs);
        gl.disable(gl.DEPTH_TEST);
    },true);
    this._.spareTexture.swapWith(this._.texture);
    
    return this;
}
