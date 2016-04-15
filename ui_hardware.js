
    // send command to remote server
    var send=function(command)
    {
      put('/feeds'+session_url+'command',command+';\n');
    }

    /* save all chains to server  */
    var save=function()
    {
      var json=JSON.stringify(chains,null,' ');
      put('/saves'+session_url+'chains.json',json);
      
      console.log('Saved.');
      
      savetimeout=false;
    }

    var clone=function(o)
    {
      return JSON.parse(JSON.stringify(o));
    }

    var savetimeout=false;
    var updateChain=function(event,ui)
    {
      if(savetimeout) clearTimeout(savetimeout);
      savetimeout=setTimeout(save,1000);
            
      var full_chain=chains[0].concat(chain,chains[1]);

      // send out to control server
      send('setChain('+JSON.stringify(full_chain)+')');
    }

    var load=function(json)
    {
      if(!json) return;
      chains=JSON.parse(json);

      main_ui();
    }

    var new_effects=[];
    var effect_ids={};
    for(key in effects) // effects from effects.js
    {
      // create flat object with the effect name in 'effect'
      // like the ones send to the server
      var new_effect={effect:key};
      if(effects[key].args)
        for(var i in effects[key].args)
          new_effect[i]=effects[key].args[i];
      effect_ids[key]=new_effects.length;
      new_effects.push(new_effect);
    }
    effects=new_effects;
        
    // load chains
    var load_chains=function()
    {
      get('/saves'+session_url+'chains.json',function(data){
        if(!data) // no saved chains in this session 
          get('/saves/chains.json',load); // load default chain instead
        else
          load(data);
      });
    }
    load_chains();

    var update_error_handler=function(url)
    {
      set_display('ERROR: remote client offline \n');
      // try again in 1s
      setTimeout(function(){
        ui_fn(); // restore display
        update_handler();
      },1000);
    }
    var update_handler=function(data)
    {
      // if we get here, an update was issued. 
      // If it wasn't us, we reload the chains, as some UI may have done it.
      if(data) load(data); 
      get('/feeds'+session_url+'update',update_handler,update_error_handler);
    }
    update_handler();

    String.prototype.repeat=function(i)
    {
      var s='';
      while(i-->0)
        s+=this;        
      return s;
    }
    
    var pad=function(text,n)
    {
      text=''+text;
      var d=n-text.length;
      if(d>0) text+=' '.repeat(d);
      return text.substring(0,n);
    }
    var pad_left=function(text,n)
    {
      text=''+text;
      var d=n-text.length;
      if(d>0) text=' '.repeat(d)+text;
      return text.substring(0,n);
    }


    var chain_id=2,layer_id=1,param_id=1, flat=[];


    var flatten=function()
    {
      var stack=[], flat=[];
      stack.push({'o':chain,'i':layer_id});
      
      while(stack.length)
      {
        var path=stack.shift();
        var obj=path.o[path.i];
        flat.push(path);
        if(obj instanceof Object)
        {
          for(key in obj)
            if(key!='type')// hide 'type' slots
              stack.push({'o':obj,'i':key});
        }
//        else
      }
      
      // remove root element
      flat.shift();
      
      return flat;
    }

    var clamp=function(x,left,right)
    {
      if(x>=right) x=right-1;
      if(x<left  ) x=left;
      return x;
    }

    var main_ui=function(id,type,delta)
    {
      if(type=='change' && id=='patch' && delta!=0)
      {
        chain_id+=delta;
        layer_id=1;
        param_id=0;
      }
      
      if(type == 'press' && id!='value')
      {
        if(id=='patch') ui_fn=chain_ui;
        if(id=='layer') ui_fn=layer_ui;
        if(id=='param') ui_fn=system_ui;
        ui_fn();
        return;
      }

      if(type=='change' && id=='layer' && delta!=0)
      {
        layer_id+=delta;
        param_id=1;      
      }
      if(type=='change' && id=='param' && delta!=0)
      {
        param_id+=delta;
      }
            
      chain_id=clamp(chain_id,0,chains.length);
      chain=chains[chain_id];
      layer_id=clamp(layer_id,1,chain.length);
      
      // create empty layer, if none is present
      if(!chain[layer_id]) chain[layer_id]={effect:'none'};

      //  update flat view on parameters
      flat=flatten();
      
      param_id=clamp(param_id,0,flat.length);
      var path =flat[param_id];
      
      // values may be toggled toggled to OSC and BEAT 
      if(type=='press' && id=='value' && path.o['type']!='osc' && path.o['type']!='beat')
      {
        var value=path.o[path.i];
        if(typeof(value)=='number')
        {
          // convert number to OSC
          value={type:'osc',f:5.0,a:value/2,p:0.0,o:value,waveform:'sine',duty:0.5};          
        }
        else if(typeof(value)=='object' && value['type']=='osc')
        {
          // convert OSC to BEAT
          value={type:'beat',pulse:10.0,f:2.0,a:value.a,p:0.0,o:value.o};
        }
        else if(typeof(value)=='object' && value['type']=='beat')        
        {
          //convert BEAT to number
          value=Math.abs(value.a)>Math.abs(value.o) ? value.a : value.o;          
        }
        path.o[path.i]=value;
        flat=flatten();
        path=flat[param_id];
      }

      var param =path.i;

      if(type=='change' && id=='value' && delta!=0)
      {
        // TODO handle special case for param 'effect', which replaces the current effect by one of the effects list
                
        if(!chain[layer_id] || param=='effect')
        {
          var i=effect_ids[path.o[path.i]];
          i+=delta;
          if(i<=0 || i>=new_effects.length) i=0;
          chain[layer_id]=clone(new_effects[i]);
          flat=flatten();
          path=flat[param_id];
        }
        else if(path.o[path.i] instanceof Object)
        {
          // TODO replace object types, eg. OSC, BEAT
        }
        else
        {        
          var path =flat[param_id];
          var s=Math.abs(path.o[path.i]/64.0);
          s=Math.max(s,0.001);
          path.o[path.i]+=s*delta;
          path.o[path.i]=Math.round(path.o[path.i]*1000.0)/1000.0;
        }
      }

      var value_shown=path.o[path.i];
      if(value_shown instanceof Object) value_shown=value_shown['type'].toUpperCase();

      var text=
        'PATCH '+pad_left(chain_id,3)+'|LAYER '+pad_left(layer_id,3)+'|PARAM '+pad_left(param_id,3)+'| VALUE\n'+
        pad(chain[0],9)+'|'+pad(chain[layer_id]['effect'],9)+'|'+pad(param,9)+'|'+pad_left(value_shown,10);
      set_display(text);
      
      // if any change was made, trigger projection update and chain save
      if(type) updateChain();
    }
    
    var chain_ui=function(id,type,delta)
    {
      if(type=='press')
      {
        ui_fn=main_ui;
        if(id=='patch') ui_fn=rename_ui;
        else if(id=='layer') chains.splice(chain_id,0,[' ']);
        else if(id=='param') chain_clipboard=chains.splice(chain_id,1)[0];
        else if(id=='value') chains.splice(chain_id,0,clone(chain_clipboard));

        ui_fn();
        return;
      }

      var text='PATCH '+pad_left(chain_id,3)+'          |'+pad(chain[0],9)+'\n'
              +'RENAME   |NEW      |CUT       |PASTE         ';
      set_display(text);
    }

    cursor=0;
    var rename_ui=function(id,type,delta)
    {
      var name=chain[0];

      if(type=='change' && id=='param' && delta!=0)
      { 
        cursor+=delta;
        if(cursor<0)            cursor=0;
        if(cursor>=name.length) cursor=name.length-1;
      }
      if(type=='change' && id=='value' && delta!=0)
      {
        var letter=name[cursor];
        if(!letter) letter='a';
        var letters=' _abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var ord=letters.indexOf(letter);
        var new_letter=letters[ord+delta];
        if(!new_letter) new_letter=' ';
        name=name.substring(0,cursor)+new_letter+name.substring(cursor+1);
        chain[0]=name;
      }
      if(type=='press')
      {
        ui_fn=main_ui;
        ui_fn();
        return;
      }

      var text=name+'\n'
              +pad_left('^',cursor+1)+pad_left('',19-cursor)+'    CURSOR|LETTER   ';
      set_display(text);
    }


    var clipboard=null;
    var layer_ui=function(id,type,delta)
    {
      var name=chain[0];

      if(type=='press')
      {
        if(id=='patch') chain.splice(layer_id,0,{'effect':'none'});
        if(id=='layer') clipboard=chain[layer_id];
        if(id=='param') clipboard=chain.splice(layer_id,1)[0];
        if(id=='value') chain.splice(layer_id,0,clone(clipboard));
        ui_fn=main_ui;
        ui_fn();
        return;
      }

      var text='           LAYER '+pad_left(layer_id,2)+' : '+chain[layer_id]['effect']+'\n'
              +'NEW      |COPY     |CUT      |PASTE   ';
      set_display(text);
    }
   
    var system_ui=function(id,type,delta)
    {
      if(type=='press')
      {
        if(id=='patch') put('/shutdown','true');
        if(id=='layer') put('/restart','true');
        if(id=='value')
        {
          // soft restart index.html 
          send('document.location.reload()');
          setTimeout(updateChain,500); // TODO get rid of wait (race condition prone)
        }
        ui_fn=main_ui;
        ui_fn();
        return;
      }
      var text='SYSTEM MENU                           \n'
              +'SHUTDOWN |RESTART H|CANCEL   |RESTART S ';
      set_display(text);
    }
 
    var ui_fn=main_ui;
    var knob_handler=function(id,value){
      console.log('B '+id+':'+value);
      ui_fn(id,value==0 ? 'press' : 'change',value);
    };        
    add_knob('patch',knob_handler);
    add_knob('layer',knob_handler);
    add_knob('param',knob_handler);
    add_knob('value',knob_handler);
