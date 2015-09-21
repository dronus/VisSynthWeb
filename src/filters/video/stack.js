function stack_push()
{
  // push current image onto stack

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
  this._.texture.use();
  var nt=this._.stackUnused.pop();
  nt.drawTo(function() { Shader.getDefaultShader().drawRect(); });
  this._.stack.push(nt);

  return this;
}

function stack_pop()
{
  var texture=this._.stack.pop();
  if(!texture)
  {
    console.log('glfx.js video stack underflow!');
    return this._.texture;
  }
  this._.stackUnused.push(texture);
  texture.swapWith(this._.texture);
  
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


