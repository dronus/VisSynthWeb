
    // send command to remote server
    var send=function(command)
    {
      put('/feeds'+session_url+'command',command+';\n');
    }

    /* save all chains to server  */
    var save=function()
    {
      var json=JSON.stringify(chains,null,' ');

      // write to persistent file
      put('/saves'+session_url+'chains.json',json);

      // notify other UI clients
      put('/feeds'+session_url+'update',json);
      
      console.log('Saved.');
      
      savetimeout=false;
    }

    var clone=function(o)
    {
      return JSON.parse(JSON.stringify(o));
    }

    var sendChain=function()
    {
      var full_chain=chains[0].concat(chain,chains[1]);
      // send out to control server
      send('setChain('+JSON.stringify(full_chain)+')');
    }

    var savetimeout=false;    
    var updateChain=function(event,ui)
    {
      if(savetimeout) clearTimeout(savetimeout);
      savetimeout=setTimeout(save,1000);
            
      sendChain();
    }

    chains=[];
    var load=function(json)
    {
      if(!json) return;
      chains=JSON.parse(json);

      console.log('chain data loaded.');

      ui_fn();
    }

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

    var effect_ids={};
    // onopen, onclose,  onupdate are called by client to notify external changes
    onopen=function(url)
    {
        effects=[];
        chains=[];
        load_chains();
        get('/effects.json',function(data){
          effects=JSON.parse(data);
          var new_effects=[];
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
          console.log('effects.js loaded.');
          ui_fn();
        });

      ui_fn=system_ui;
      ui_fn();
    }
    onclose=function(url)
    {
      chains=[]; effects=[];
      ui_fn=system_ui;
      ui_fn();
    }
    onupdate=function(data)
    {
      // if we get here, an update was issued. 
      // If it wasn't us, we reload the chains, as some UI may have done it.
      if(data) load(data);      
    }

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
      
      if(type == 'press')
      {
        if(id=='patch') ui_fn=chain_ui;
        if(id=='layer') ui_fn=layer_ui;
        if(id=='param') 
        {
          system_command_id=0;
          ui_fn=system_ui;
        }
        if(id=='value') ui_fn=value_ui;
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
      
      var param =path.i;

      if(type=='change' && id=='value' && delta!=0)
      {
        // TODO handle special case for param 'effect', which replaces the current effect by one of the effects list
                
        if(!chain[layer_id] || param=='effect')
        {
          var i=effect_ids[path.o[path.i]];
          i+=delta;
          if(i<=0 || i>=effects.length) i=0;
          chain[layer_id]=clone(effects[i]);
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

      // update projection if chain switches
      if(id=='patch' && type=='change')
        sendChain();
      // update projection and save change if value changed
      if(id=='value')
        updateChain();

      var value_shown=path.o[path.i];
      if(value_shown instanceof Object) value_shown=value_shown['type'].toUpperCase();

      var text=
        'PATCH '+pad(chain_id,3)+' LAYER '+pad(layer_id,3)+'\n'
        +pad(chain[0],9)+' '+pad(chain[layer_id]['effect'],9)+'\n'
        +pad(param,9)+' '+pad(value_shown,10)+'\n'
        +'PARAM '+pad(param_id,3)+' VALUE\n';
      set_display(text);
    }
    
    var value_ui=function(id,type,delta)
    {

      chain=chains[chain_id];
      flat=flatten();
      var path =flat[param_id];
      var param =path.i;

      if(param=='effect')
      {
        ui_fn=main_ui;
        return; 
      }
      
      // values may be toggled toggled to OSC and BEAT 
      var can_convert=(path.o['type']!='osc' && path.o['type']!='beat');
      
      if(type=='press')
      {
        var value=path.o[path.i];
        
        if(typeof(value)!='number')
          value=Math.abs(value.a)>Math.abs(value.o) ? value.a : value.o;
        
        if(id=='patch')
        {
          // convert to OSC
          value={type:'osc',f:5.0,a:value/2,p:0.0,o:value,waveform:'sine',duty:0.5};          
        }
        else if(id=='layer')
        {
          // convert to BEAT
          value={type:'beat',pulse:10.0,f:2.0,a:value,p:0.0,o:value};
        }
        else if(id=='param')
        {
          //convert to plain value, already done above.
        }
        
        if(id!='value') 
        {
          path.o[path.i]=value;
          updateChain();
        }
        ui_fn=main_ui;
        ui_fn();
        return;
      }

      var value_shown=path.o[path.i];
      if(value_shown instanceof Object) value_shown=value_shown['type'].toUpperCase();

      var text='TO OSC    TO BEAT\n'      
              +pad(chain[0],9)+' '+pad(chain[layer_id]['effect'],9)+'\n'
              +pad(param,9)+' VALUE\n'
              +'TO NUMBER '+pad(value_shown,10);       
      set_display(text);
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

        if(id!='patch') updateChain();

        ui_fn();
        return;
      }

      var text='RENAME    NEW      \n'
              +'PATCH '+pad_left(chain_id,3)
              +'          \n'+pad(chain[0],9)+'\n'
              +'CUT       PASTE    ';
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
        updateChain();
        ui_fn=main_ui;
        ui_fn();
        return;
      }

      var text=name+'\n'
              +pad_left('^',cursor+1)+pad_left('',19-cursor)+'\n'
              +'\n'
              +'   CURSOR LETTER   ';
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
        updateChain();
        ui_fn=main_ui;
        ui_fn();
        return;
      }

      var text='NEW       COPY     \n'
              +'LAYER '+pad_left(layer_id,2)+'\n'
              +chain[layer_id]['effect']+'\n'
              +'CUT       PASTE   ';
      set_display(text);
    }
  
    var system_command_id=0;
    var system_host_id=0;
    var system_hosts=['localhost','nf-vissynthbox-2.local','nf-vissynthbox-3.local','nf-kiosk.local'];
    var system_ui=function(id,type,delta)
    {

      var system_commands=[
        {name:'',fn:function(){}},
        {name:'SHUTDOWN',fn:function(){  put('/shutdown','true'); }},
        {name:'RESTART',fn:function(){  put('/restart','true'); }},
        {name:'SOFT RESTART',fn:function(){  send('document.location.reload()'); setTimeout(updateChain,500); }},
        {name:'SHUTDOWN ME',fn:function(){ require('child_process').spawn('sh',['shutdown.sh'], {stdio:'inherit'});}},
      ];
      if(type=='change')
      {
        if(id=='value') system_command_id=clamp(system_command_id+delta,0,system_commands.length);
        if(id=='patch' || id=='layer') 
        {
          system_host_id   =clamp(system_host_id   +delta,0,system_hosts.length);
          set_host(system_hosts[system_host_id]);
          effects=[];chains=[];
        }
      }
      if(type=='press')
      {
        if(id=='value')
          system_commands[system_command_id].fn();
        if(chains.length && effects.length) 
            ui_fn=main_ui;
        ui_fn();
        return;
      }
      var text=
              'HOST '+pad(system_hosts[system_host_id],14)+'\n'
              +'SYSTEM    '+(chains.length && effects.length ?'online ':'offline ')+'\n'
              +(!system_command_id ? '' :  'CMD: ')+pad_left(system_commands[system_command_id].name,14)+' \n'
              +'EXIT      CMD/EXEC  '
      set_display(text);
    }
 
    var knob_handler=function(id,value){
      console.log('B '+id+':'+value);
      ui_fn(id,value==0 ? 'press' : 'change',value);
    };        
    add_knob('patch',knob_handler);
    add_knob('layer',knob_handler);
    add_knob('param',knob_handler);
    add_knob('value',knob_handler);

    var ui_fn=system_ui;
    ui_fn();
