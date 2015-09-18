function kaleidoscope(sides,angle,angle2) {
    gl.kaleidoscope = gl.kaleidoscope || new Shader(null, '\
        uniform sampler2D texture;\
	uniform float angle;\
	uniform float angle2;\
	uniform float sides;\
        varying vec2 texCoord;\
	void main() {\
		vec2 p = texCoord - 0.5;\
		float r = length(p);\
		float a = atan(p.y, p.x) + angle;\
		float tau = 2. * 3.1416 ;\
		a = mod(a, tau/sides);\
		a = abs(a - tau/sides/2.) * 1.5 ;\
		p = r * 2. * vec2(cos(a+angle2), sin(a+angle2));\
		vec4 color = texture2D(texture, mod(p + 0.5,vec2(1.,1.)));\
		gl_FragColor = color;\
	}\
    ');

    simpleShader.call(this, gl.kaleidoscope, {sides:Math.round(sides), angle:angle, angle2:angle2});

    return this;
}

