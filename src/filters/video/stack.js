function stack_push(from_texture)
{
  // push given or current image onto stack
  if(!from_texture) from_texture=this._.texture;


  // add another texture to empty stack pool if needed
  var t=this._.texture;
  if(!this._.stackUnused.length)
    this._.stackUnused.push(new Texture(t.width,t.height,t.format,t.type));
  
  // check for stack overflow
  if(this._.stack.length>10) 
  {
    console.log('glfx.js video stack overflow!');
    return this;
  }
  
  // copy current frame on top of the stack
  from_texture.use();
  var nt=this._.stackUnused.pop();
  nt.drawTo(function() { Shader.getDefaultShader().drawRect(); });
  this._.stack.push(nt);

  return nt;
}

function stack_pop(to_texture)
{
  var texture=this._.stack.pop();
  if(!texture)
  {
    console.log('glfx.js video stack underflow!');
    return this._.texture;
  }
  this._.stackUnused.push(texture);
  
  if(to_texture) 
  {
    texture.swapsWith(to_texture);
    return null;
  }
  
  return texture;
}

function stack_prepare()
{
  // check stack

  // make sure the stack is there
  if(!this._.stack) this._.stack=[];
  if(!this._.stackUnused) this._.stackUnused=[];

  // report if stack is still full
  if(this._.stack.length)
    console.log("glfx.js video stack leaks "+this._.stack.length+" elements.");

  // pop any remaining elements
  while(this._.stack.length)
    this._.stackUnused.push(this._.stack.pop());
}


