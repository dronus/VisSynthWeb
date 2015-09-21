/**
 * @filter       Fast Blur
 * @description  This is the most basic blur filter, which convolves the image with a
 *               pyramid filter. The pyramid filter is separable and is applied as two
 *               perpendicular triangle filters.
 * @param radius The radius of the pyramid convolved with the image.
 */
function fastBlur(radius) {
    gl.fastBlur = gl.fastBlur || new Shader(null, '\
        uniform sampler2D texture;\
        uniform vec2 delta;\
        varying vec2 texCoord;\
        void main() {\
            vec4 color = vec4(0.0);\
            float a=1./5.;\
            float b=1./5.;\
            color+=a*texture2D(texture, texCoord         );\
            color+=b*texture2D(texture, texCoord + delta * vec2( 1.,0.) );\
            color+=b*texture2D(texture, texCoord + delta * vec2(-1.,0.) );\
            color+=b*texture2D(texture, texCoord + delta * vec2(0., 1.) );\
            color+=b*texture2D(texture, texCoord + delta * vec2(0.,-1.) );\
            gl_FragColor = color; \
        }\
    ');

    var steps=radius/2;
    var delta=Math.sqrt(radius);
    for(var i=0; i<steps; i++)
    {
      simpleShader.call(this, gl.fastBlur, { delta: [delta/this.width, delta/this.height]});
    }
    return this;
}
