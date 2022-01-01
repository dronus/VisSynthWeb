//  Manage a WebGL GLSL shader program

function compileSource(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        document.body.innerHTML=gl.getShaderInfoLog(shader);
        document.body.style.fontSize='100px';
        throw 'compile error: ' + gl.getShaderInfoLog(shader);
    }
    return shader;
}

var defaultVertexSource = '\
attribute vec2 vertex;\
varying vec2 texCoord;\
void main() {\
    texCoord = vertex;\
    gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);\
}';

var defaultFragmentSource = '\
uniform sampler2D texture;\
varying vec2 texCoord;\
void main() {\
    gl_FragColor = texture2D(texture, texCoord);\
}';

export function Shader(gl, vertexSource, fragmentSource) {
    this.gl=gl;
    this.vertexAttribute = null;
    this.texCoordAttribute = null;
    this._attributes={};
    this._element_count=0;
    this.program = gl.createProgram();
    vertexSource = vertexSource || defaultVertexSource;
    fragmentSource = fragmentSource || defaultFragmentSource;
    fragmentSource = 'precision mediump float;' + fragmentSource; // annoying requirement is annoying
    gl.attachShader(this.program, compileSource(gl,gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(this.program, compileSource(gl,gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw 'link error: ' + gl.getProgramInfoLog(this.program);
    }
}

Shader.prototype.uniforms = function(uniforms) {
    let gl=this.gl;
    gl.useProgram(this.program);
    for (var name in uniforms) {
        if (!uniforms.hasOwnProperty(name)) continue;
        var location = gl.getUniformLocation(this.program, name);
        if (location === null) continue; // will be null if the uniform isn't used in the shader
        var value = uniforms[name];
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            switch (value.length) {
                case 1: gl.uniform1fv(location, new Float32Array(value)); break;
                case 2: gl.uniform2fv(location, new Float32Array(value)); break;
                case 3: gl.uniform3fv(location, new Float32Array(value)); break;
                case 4: gl.uniform4fv(location, new Float32Array(value)); break;
                case 9: gl.uniformMatrix3fv(location, false, new Float32Array(value)); break;
                case 16: gl.uniformMatrix4fv(location, false, new Float32Array(value)); break;
                default: throw 'dont\'t know how to load uniform "' + name + '" of length ' + value.length;
            }
        } else if (typeof value == 'number') {
            gl.uniform1f(location, value);
        } else {
            throw 'attempted to set uniform "' + name + '" to invalid value ' + (value || 'undefined').toString();
        }
    }
    // allow chaining
    return this;
};

// textures are uniforms too but for some reason can't be specified by gl.uniform1f,
// even though floating point numbers represent the integers 0 through 7 exactly
Shader.prototype.textures = function(textures) {
    let gl=this.gl;
    gl.useProgram(this.program);
    var i=0;
    for (var name in textures) {
        // if (!textures.hasOwnProperty(name)) continue;
        textures[name].use(i);
        gl.uniform1i(gl.getUniformLocation(this.program, name), i);
        i++;
    }
    // allow chaining
    return this;
};

// draw a rectangle using this shader. 
// This is by far the most way to render effects, by drawing a full image using a single GLSL shader.
Shader.prototype.drawRect = function() {
    let gl=this.gl;
    if (gl.vertexBuffer == null) {
      gl.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,0,1,1,0,1,1]), gl.STATIC_DRAW);
    }
    if (this.vertexAttribute == null) {
        this.vertexAttribute = gl.getAttribLocation(this.program, 'vertex');
        gl.enableVertexAttribArray(this.vertexAttribute);
    }
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.vertexBuffer);
    gl.vertexAttribPointer(this.vertexAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

// set shader attributes. Vector sizes needs to be defined by "sizes" in the same order!
Shader.prototype.attributes=function(attributes,sizes){
  let gl=this.gl;
  for(let key in attributes)
  {
    var attribute=this._attributes[key];
    if(!attribute)
    {
      attribute={};
      attribute.buffer=gl.createBuffer();
      attribute.location=gl.getAttribLocation(this.program, key);
      attribute.size=sizes[key];
      gl.enableVertexAttribArray(attribute.location);          
      this._attributes[key]=attribute;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attributes[key]), gl.STATIC_DRAW);
    this._element_count=attributes[key].length/attribute.size;
  }
}

// draw vertex arrays 
// this is used for mesh rendering (displacements or 3D-rendering)
Shader.prototype.drawArrays = function(mode){
    let gl=this.gl;
    gl.useProgram(this.program);
    for(let key in this._attributes)
    {
      var attribute=this._attributes[key];
      gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer);
      gl.vertexAttribPointer(attribute.location, attribute.size, gl.FLOAT, false, 0, 0);          
    }
    gl.drawArrays(mode, 0, this._element_count);
};

