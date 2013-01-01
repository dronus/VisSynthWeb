$fs=1;
$fa=1;


display_w=85.5;
display_h=28.5;

border=10;
w=display_w+2*10;
l=display_h+2*10+2*14;

mainboard_w=94;
mainboard_l=58.4;

wall=2;

// TODO bei dieser Höhe muss Akku / Mainboard neben den UI-Einheiten liegen?
h=15;

encoder_d=7;


module aa_cell()
{
	rotate(90,[1,0,0]) color([.3,.3,.7]){
		cylinder(h=49,r=14/2,center=true);
		translate([0,0,-49/2-1/2]) cylinder(h=1,r=2,center=true);
	}
}

module bevel_cube(size,bevel)
{
	hull()
	{
		cube(size-[0,bevel,bevel],center=true);
		cube(size-[bevel,bevel,0],center=true);
		cube(size-[bevel,0,bevel],center=true);
	}
}

module mainboard()
{
	color([.7,.3,0]) cube([mainboard_w,mainboard_l,2],center=true);
}

module knobs_and_display(inner_only)
{
	translate([0,0,-2.5+0.1-(inner_only ? wall : 0)]) {
		color([.4,.4,.4]) cube([display_w,display_h,5],center=true);
		if(!inner_only) color([.2,1.,.2]) translate([0,0,5/2]) cube([display_w*.9,display_h*.9,.1],center=true);
	}
	
	for(x=[-1,1])
	  for(y=[-1,1])
	    translate([x*display_w/4,y*(display_h/2+24/2),-wall])
		   color([.4,.4,.4]) union(){
				if(!inner_only) cylinder(r=encoder_d/2,h=15);
				translate([0,0,-3]) cube([14,14,6],center=true);
			}
}



module meld()
{
	hull() intersection() 
   {
		child(0);
		for (a = [1:$children-1]) child(a);
	}
	for (a = [1:$children-1]) child(a);
}


module inner_right()
{
   y=-8;
	cell_y=-0;
	translate([0,0,y-1]) mainboard();
	knobs_and_display(true);	
}


module inner_left()
{
   y=-8;
	cell_y=-0;
	translate([-w/2-3.1,0,y+cell_y]) aa_cell();
	translate([-w/2-18,0,y+cell_y]) aa_cell();
}


module inner_hull()
{
   y=-8;
	cell_y=-0;

   meld() {
		translate([-55,0,0]) cube([60,100,40],center=true);
		hull() inner_left();
		hull() inner_right();
	}
}

module inner()
{
	inner_left();
	inner_right();
}


knobs_and_display(false);

inner();

%difference()
{	
	minkowski()
	{
		bevel_cube([wall*2,wall*2,wall*2],wall);
		inner_hull();
	}
	minkowski() 
	{
		knobs_and_display(false);
		cube([.2,.2,.2],center=true);
	}
}





