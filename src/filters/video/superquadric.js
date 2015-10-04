function superquadric(A,B,C,r,s,t,angle) {
    gl.superquadric = gl.superquadric || new Shader('\
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

  function superquadric_p(u,v,A,B,C,r,s,t) {
      // parametric equations for superquadric, from http://en.wikipedia.org/wiki/Superquadrics 
      //   with respect to surface lat-lon params (u,v)
      //   having scaling values along shape x,y,z axes (A,B,C)
      //   and shape definition exponents along shape x,y,z axes (r,s,t)
      //
      //   x(u,v) = A*c(v,2/r)*c(u,2/r)
      //   y(u,v) = B*c(v,2/s)*s(u,2/s)
      //   z(u,v) = C*s(v,2/t)
      //
      // aux functions 
      //   c(w,m) = sgn(cos(w))*abs(cos(w))^m
      //   s(w,m) = sgn(sin(w))*abs(sin(w))^m
      var point = [];
      point.x = A*superquadric_c(v,2/r)*superquadric_c(u,2/r);
      point.y = B*superquadric_c(v,2/s)*superquadric_s(u,2/s);
      point.z = C*superquadric_s(v,2/t);
      return point;
  }
  function superquadric_c(w,m) {
      if (typeof Math.sign !== 'undefined') 
          return Math.sign(Math.cos(w))*Math.pow(Math.abs(Math.cos(w)),m);
      else
          return Math_sign(Math.cos(w))*Math.pow(Math.abs(Math.cos(w)),m);
          // why does Chrome not have Math.sign(); that seems unwise
  }
  function superquadric_s(w,m) {
      if (typeof Math.sign !== 'undefined') 
          return Math.sign(Math.sin(w))*Math.pow(Math.abs(Math.sin(w)),m);
      else
          return Math_sign(Math.sin(w))*Math.pow(Math.abs(Math.sin(w)),m);  
          // why does Chrome not have Math.sign(); that seems unwise
  }
  function Math_sign(a) {
      if (a < 0) return -1;
      else if (a > 0) return 1;
      else return 0;
  }



    var vertices=[];
    var uvs=[];










    // squad = [];
    // squad.scaling = {A:1, B:1, C:1};
    //squad.shape = {r:2, s:2, t:2};  // start as sphere
    //squad.shape = {r:10, s:10, t:10};  // start as rounded cube
    //squad.shape = {r:0.6, s:0.6, t:0.6};  // my favorite
    for (sv=-Math.PI/2,i=0;sv<=Math.PI/2;sv+=Math.PI/25,i++) { 
        for (su=-Math.PI,j=0;su<=Math.PI;su+=Math.PI/50,j++) { 
        
            var u=su/Math.PI/2+0.5;
            var v=sv/Math.PI+0.5;

            var sv2=sv-Math.PI/25;
            var v2=sv2/Math.PI+0.5;
        
            var p1 = superquadric_p(su,sv,A,B,C,r,s,t);
            vertices.push(p1.x,p1.z,p1.y);
            uvs.push(u,v);

            var p2 = superquadric_p(su,sv2,A,B,C,r,s,t);
            vertices.push(p2.x,p2.z,p2.y);
            uvs.push(u,v2);
                
        }
    }










    var proj=mat4.perspective(45.,this.width/this.height,1.,100.);

    var matrix=mat4.identity();
    mat4.translate(matrix,[0,0,-5.]);
    mat4.rotate(matrix,angle,[0.0,1.0,0.0]);    
    
    mat4.multiply(proj,matrix,matrix);
    
    var uniforms={
      matrix:matrix
    };

  
    this._.texture.use(0);
    this._.spareTexture.drawTo(function() {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.superquadric.uniforms(uniforms).drawTriangles(vertices,uvs);
        gl.disable(gl.DEPTH_TEST);
    },true);
    this._.spareTexture.swapWith(this._.texture);
    
    return this;
}
