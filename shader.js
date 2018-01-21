var Shader = (function() {
    function isArray(obj) {
        return Object.prototype.toString.call(obj) == '[object Array]';
    }

    function isNumber(obj) {
        return Object.prototype.toString.call(obj) == '[object Number]';
    }

    function compileSource(type, source) {
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
    in vec2 vertex;\
    out vec2 texCoord;\
    void main() {\
        texCoord = vertex;\
        gl_Position = vec4(vertex * 2.0 - 1.0, 0.0, 1.0);\
    }';

    var defaultFragmentSource = '\
    uniform sampler2D input0;\
    in vec2 texCoord;\
    void main() {\
        output0 = texture(input0, texCoord);\
    }';

    function Shader(vertexSource, fragmentSource) {
        this.vertexAttribute = null;
        this.texCoordAttribute = null;
        this._attributes={};
        this._element_count=0;
        this.program = gl.createProgram();
        vertexSource = vertexSource || defaultVertexSource;
        fragmentSource = fragmentSource || defaultFragmentSource;
        vertexSource='#version 300 es\n'+vertexSource;
        fragmentSource = '#version 300 es\nprecision mediump float;\nout vec4 output0;\n' + fragmentSource; // annoying requirement is annoying
        gl.attachShader(this.program, compileSource(gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(this.program, compileSource(gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw 'link error: ' + gl.getProgramInfoLog(this.program);
        }
    }

    Shader.prototype.uniforms = function(uniforms) {
        gl.useProgram(this.program);
        for (var name in uniforms) {
            if (!uniforms.hasOwnProperty(name)) continue;
            var location = gl.getUniformLocation(this.program, name);
            if (location === null) continue; // will be null if the uniform isn't used in the shader
            var value = uniforms[name];
            if (isArray(value) || ArrayBuffer.isView(value)) {
                switch (value.length) {
                    case 1: gl.uniform1fv(location, new Float32Array(value)); break;
                    case 2: gl.uniform2fv(location, new Float32Array(value)); break;
                    case 3: gl.uniform3fv(location, new Float32Array(value)); break;
                    case 4: gl.uniform4fv(location, new Float32Array(value)); break;
                    case 9: gl.uniformMatrix3fv(location, false, new Float32Array(value)); break;
                    case 16: gl.uniformMatrix4fv(location, false, new Float32Array(value)); break;
                    default: throw 'dont\'t know how to load uniform "' + name + '" of length ' + value.length;
                }
            } else if (isNumber(value)) {
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

    Shader.prototype.drawRect = function() {
        
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

    Shader.prototype.attributes=function(attributes,sizes){
      for(key in attributes)
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

    Shader.prototype.drawArrays = function(mode){
    
        gl.useProgram(this.program);
        for(key in this._attributes)
        {
          var attribute=this._attributes[key];
          gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer);
          gl.vertexAttribPointer(attribute.location, attribute.size, gl.FLOAT, false, 0, 0);          
        }
        gl.drawArrays(mode, 0, this._element_count);
    };


    Shader.getDefaultShader = function() {
        gl.defaultShader = gl.defaultShader || new Shader();
        return gl.defaultShader;
    };

    return Shader;
})();
