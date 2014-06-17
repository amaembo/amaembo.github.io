/*
cube.js -- Canvas Rubik's Cube simulator library
Version: 1.0
Author: Tagir F. Valeev <lany@ngs.ru>
License: MIT [ http://www.opensource.org/licenses/mit-license.php ]
*/

/*
TODO:
Rotate whole cube by keyboard
Rotate slices by keyboard
When rotating slice by mouse, highlight slice
Perspective projection
Redo
Support IE6-8
Save/load (in cookies?)
*/

/**
 * Constructs cube
 * element -- canvas document element to attach to
 * params -- parameters (all optional), described in constructor body below
 */
function RubikCube(element, params)
{
	var _this = this;

	// These are parameters user may set (set also setParams method to change already initialized object)
	this.size = 3;	// cube difficulty (number of elements)
	this.background = "#000000";	// canvas background color
	this.colors = ["#007000","#0000FF","#FFFFFF","#FFEB00","#FF8000","#DD0000"];	// face colors
	this.matrix = [[1,0,0],[0,1,0],[0,0,1]];
	this.addRotation(-0.3,0.3);	// initial rotation matrix
	this.zoom = 1;		// cube scale
	this.z = 10;		// unused yet
	this.speed = 300;	// milliseconds to perform single animation
	this.borderColor = "#303030";	// cube borders
	this.innerColor = "#202020";	// cube internals
	this.lineWidth = 2;	// cube borders width
	this.shiny = 0.25;	// 0 = flat faces, 0.25 = shiny faces
	this.lookSensitivity = 0.005;	// sensitivity of free-look (higher numbers = faster rotation)
	if(params != undefined)
		for(key in params)
			this[key] = params[key];

	this.canvas = element;
	this.ctx = element.getContext("2d");
	this.width = element.width;
	this.height = element.height;
	this.scale = Math.min(this.width, this.height)/4*this.zoom;
	this.faceNormals = [[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,0],[-1,0,0]];
	this.neighbors = [[1,4,2,5,3],[0,5,2,4,3],[3,4,1,5,0],[2,4,0,5,1],[5,1,2,0,3],[4,0,2,1,3]];
	this.animationQueue = [];
	this.reset();
	this.offsetX = 0;
	this.offsetY = 0;
	var element = this.canvas;
	do {
		this.offsetX += element.offsetLeft;
		this.offsetY += element.offsetTop;
		element = element.offsetParent;
	} while(element != undefined);
	this.canvas.onmousedown = function(e) {_this.onMouseDown(e);return false;}
	this.canvas.onmousemove = function(e) {_this.onMouseMove(e);return false;}
	this.canvas.onmouseup = function(e) {_this.onMouseUp(e);return false;}
	this.canvas.oncontextmenu = function(e) {return false;}
}

/**
 * Changes parameters of already constructed cube
 */
RubikCube.prototype.setParam = function(params)
{
	var oldSize = this.size;
	if(params != undefined)
		for(key in params)
			this[key] = params[key];
	this.scale = Math.min(this.width, this.height)/4*this.zoom;
	if(oldSize != this.size)
		this.reset();
	this.invalidate();
}

/**
 * Resets cube state (all faces will be in initial states)
 */
RubikCube.prototype.reset = function()
{
	this.state = [];
	for(var face=0; face<6; face++)
	{
		var faceElems = [];
		for(var elem = 0; elem<this.size*this.size; elem++)
			faceElems.push(face);
		this.state.push(faceElems);
	}
	this.animationQueue = [];
	this.angle = undefined;
	this.slice = undefined;
	this.undoBuffer = [];
	this.invalidate();
}

/**
 * Undoes last move specified by rotateSlice or addSliceRotation (undo will be animated)
 */
RubikCube.prototype.undo = function()
{
	if(this.undoBuffer.length==0) return;
	this.addSliceRotation(this.undoBuffer.pop(), true);
}

/**
 * Shuffles cube
 * n -- number of random rotations to perform
 * animate = 0 -- no animation
 * animate = 1 -- fast animation (cube redrawn after each rotation)
 * animate = 2 -- full animation
 */
RubikCube.prototype.shuffle = function(n, animate)
{
	var _this = this;
	if(n == undefined) n = this.size*this.size*2;
	if(animate == undefined) animate = 0;
	if(n == 0) return;
	var shuffleOnce = function()
	{
		_this.rotateSlice([Math.floor(Math.random()*6),Math.floor(Math.random()*_this.size),Math.random>0.5]);
	}
	if(animate == 0)
	{
		for(var i=0; i<n; i++) shuffleOnce();
	}
	if(animate == 1)
	{
		shuffleOnce();
		if(n>0) setTimeout(function(){_this.shuffle(n-1,animate)},10);
	}
	if(animate == 2)
	{
		for(var i=0; i<n; i++) this.addSliceRotation([Math.floor(Math.random()*6),Math.floor(Math.random()*_this.size),Math.random>0.5]);
	}
}

/**
 * adds rotation of slice to animation queue (performs animated slice rotation)
 * slice -- triple [face, slice, direction]
 *       face - either absolute face number (0-5) or letter specifying face orientation:
 *           (f)rontmost,(b)ackmost,(l)eftmost,(r)rightmost,(u)pmost,(d)ownmost
 *       slice - number of slice to rotate which is parallel to specified face (0-(cube size-1))
 *       direction - true = clockwise when looking from face, falce = counter-clockwise
 * skipUndo -- (optional) if true, then this rotation will not appear in undo buffer
 */
RubikCube.prototype.addSliceRotation = function(slice, skipUndo)
{
	this.addAnimation({type: "slice", slice: this.convertSlice(slice), skipUndo: skipUndo});
}

/**
 * rotates slice (non-animated)
 * slice -- triple [face, slice, direction]
 *       face - either absolute face number (0-5) or letter specifying face orientation:
 *           (f)rontmost,(b)ackmost,(l)eftmost,(r)rightmost,(u)pmost,(d)ownmost
 *       slice - number of slice to rotate which is parallel to specified face (0-(cube size-1))
 *       direction - true = clockwise when looking from face, falce = counter-clockwise
 * skipUndo -- (optional) if true, then this rotation will not appear in undo buffer
 */
RubikCube.prototype.rotateSlice = function(slice, skipUndo)
{
	slice = this.convertSlice(slice);
	var direction = slice[2];
	if(slice[1] == 0)	// face (non-inner) slice
	{
		var faceState = [];
		for(var i=0; i<this.size; i++)
			for(var j=0; j<this.size; j++)
				faceState[i*this.size+j] = direction?this.state[slice[0]][(this.size-j-1)*this.size+i]:this.state[slice[0]][j*this.size+(this.size-i-1)];
		this.state[slice[0]] = faceState;
	}
	var sliceState = [];
	for(var i=0; i<=4; i++)
	{
		for(var elem=0; elem<this.size; elem++)
		{
			var state;
			var face = this.neighbors[slice[0]][direction?(4-i)%4+1:(i+1)%4+1];
			var nextFace = this.neighbors[slice[0]][direction?(7-i)%4+1:(i+2)%4+1];
			var state = i==4?sliceState[elem]:this.state[nextFace][this.getSliceElement(slice,nextFace,elem)];
			if(i==0) sliceState[elem] = state;
			else this.state[face][this.getSliceElement(slice,face,elem)] = state;
		}
	}
	if(!skipUndo) this.undoBuffer.push([slice[0],slice[1],!direction]);
	this.invalidate();
}

/**
 * Returns cube element by point
 * x,y -- point position (in pixels, relative to canvas position)
 * returns either undefined (if cube doesn't contain this point) or triple [face,i,j]
 * where face is face number (0-5) and i,j is element coordinates within face (0-(cube size-1))
 */
RubikCube.prototype.getPick = function(x,y)
{
	x = (x-this.width/2)/this.scale;
	y = (y-this.height/2)/this.scale;
	for(var face = 0; face<6; face++)
	{
		var norm = this.getFaceNormal(face);
		if(norm[2] <= 0) continue;
		var a = (1-x*norm[0]-y*norm[1])/norm[2];
		var l = [x-norm[0],y-norm[1],a-norm[2]];
		var normL = this.getFaceNormal(this.neighbors[face][3]);
		var normU = this.getFaceNormal(this.neighbors[face][2]);
		var i = Math.floor((1-normL[0]*l[0]-normL[1]*l[1]-normL[2]*l[2])/2*this.size);
		var j = Math.floor((1-normU[0]*l[0]-normU[1]*l[1]-normU[2]*l[2])/2*this.size);
		if(i<0 || i>=this.size || j<0 || j>=this.size) continue;
		return [face,i,j];
	}
}

/**
 * Converts face letter-code to absolute face number (0-5)
 * face letter-code might be:
 * (f)rontmost,(b)ackmost,(l)eftmost,(r)rightmost,(u)pmost,(d)ownmost
 */
RubikCube.prototype.convertFace = function(face)
{
	if(parseInt(face)==face) return parseInt(face);
	if(this.bestFront == undefined)
	{
		for(var i=0; i<6; i++)
		{
			if(this.norm[i] == undefined)
				this.norm[i] = this.multMatVec(this.matrix,this.faceNormals[i]);
			if(this.bestFront == undefined || this.bestFront[1]<this.norm[i][2]) this.bestFront = [i,this.norm[i][2]];
		}
		for(var i=0; i<6; i++)
		{
			if(i != this.bestFront[0] && (this.bestLeft == undefined || this.bestLeft[1]>this.norm[i][0])) this.bestLeft = [i,this.norm[i][0]];
		}
		for(var i=0; i<6; i++)
		{
			if(i != this.bestFront[0] && i != this.bestLeft[0] && (this.bestUp == undefined || this.bestUp[1]>this.norm[i][1])) this.bestUp = [i,this.norm[i][1]];
		}
	}
	if(face == "f") return this.bestFront[0];
	if(face == "b") return this.neighbors[this.bestFront[0]][0];
	if(face == "l") return this.bestLeft[0];
	if(face == "r") return this.neighbors[this.bestLeft[0]][0];
	if(face == "u") return this.bestUp[0];
	if(face == "d") return this.neighbors[this.bestUp[0]][0];
}

/**
 * Invalidates cube view (signals to rerender it)
 */
RubikCube.prototype.invalidate = function()
{
	var _this = this;
	if(this.nextRender == undefined) this.nextRender = setTimeout(function() {_this.render()}, 0);
}

/**
 * renders cube
 */
RubikCube.prototype.render = function()
{
	this.nextRender = undefined;
	this.ctx.strokeStyle = this.borderColor;
	this.ctx.lineWidth = this.lineWidth;
	this.ctx.lineJoin = "round";
	this.ctx.fillStyle = this.background;
	this.ctx.fillRect(0,0,this.width,this.height);
	var faces = [];
	for(var face = 0; face<18; face++)
	{
		var zOrder = this.getFaceZOrder(face);
		if(zOrder != undefined) faces.push([face,zOrder]);
	}
	faces.sort(function(a,b) {return a[1]-b[1]});
	for(var faceNum = 0; faceNum < faces.length; faceNum++)
	{
		var face = faces[faceNum][0];
		var elementCount = this.getFaceElementCount(face);
		for(var i = 0; i<elementCount; i++)
		{
			var vert2d = [];
			for(var ii = 0; ii<4; ii++)
			{
				var vertPos = this.getElementVector(face, i, ii);
				vert2d[ii] = [vertPos[0]*this.scale+this.width/2,vertPos[1]*this.scale+this.height/2];
			}
			this.ctx.beginPath();
			this.ctx.moveTo(vert2d[0][0],vert2d[0][1]);
			this.ctx.lineTo(vert2d[1][0],vert2d[1][1]);
			this.ctx.lineTo(vert2d[3][0],vert2d[3][1]);
			this.ctx.lineTo(vert2d[2][0],vert2d[2][1]);
			this.ctx.closePath();
			this.ctx.fillStyle = this.getElementFillStyle(face, i);
			this.ctx.fill();
			this.ctx.stroke();
		}
	}
}

////////////////////////////////////////////////////
// Internal methods go here

RubikCube.prototype.animate = function()
{
	var _this = this;
	if(this.animationQueue.length == 0) return;
	if(this.animationQueue[0].phase == undefined)
	{
		this.animationQueue[0].phase = 0;
		this.animationStart = (new Date()).getTime();
	} else
	{
		this.animationQueue[0].phase = ((new Date()).getTime()-this.animationStart)/this.speed;
		if(this.animationQueue[0].phase >= 1)	// animation finished
		{
			if(this.animationQueue[0].type = "slice")
			{
				this.rotateSlice(this.animationQueue[0].slice, this.animationQueue[0].skipUndo);
				this.slice = undefined;
				this.angle = undefined;
				this.norm = [];
			}
			this.animationQueue.shift();
		} else
		{
			this.slice = this.animationQueue[0].slice;
			this.angle = this.animationQueue[0].phase*Math.PI/2*(this.slice[2]?1:-1);
			this.norm = [];
			this.invalidate();
		}
	}
	if(this.animationQueue.length > 0) setTimeout(function() {_this.animate()}, 0);
}

RubikCube.prototype.addAnimation = function(params)
{
	var _this = this;
	this.animationQueue.push(params);
	if(this.animationQueue.length==1) setTimeout(function() {_this.animate()}, 0);
}

RubikCube.prototype.onMouseDown = function(event)
{
	if(event.shiftKey || event.button==2)
	{
		this.dragStart = [event.clientX,event.clientY];
		return;
	}
	if(this.animationQueue.length>0) return;
	var pos = this.getPick(event.clientX-this.offsetX,event.clientY-this.offsetY);
	if(pos != undefined)
	{
		this.dragStart = [event.clientX,event.clientY];
		this.dragPos = pos;
		this.dragSlices = [[this.neighbors[pos[0]][3],pos[1],true],[this.neighbors[pos[0]][2],pos[2],true]];
		this.dragNormals = [this.getFaceNormal(this.neighbors[pos[0]][2]),this.getFaceNormal(this.neighbors[pos[0]][1])];
		for(var i=0; i<2; i++)
		{
			var norm2d = Math.sqrt(this.dragNormals[i][0]*this.dragNormals[i][0]+this.dragNormals[i][1]*this.dragNormals[i][1]);
			this.dragNormals[i] = [this.dragNormals[i][0]/norm2d,this.dragNormals[i][1]/norm2d];
		}
	}
}

RubikCube.prototype.onMouseMove = function(event)
{
	if(this.dragStart != undefined)
	{
		if(this.dragSlices != undefined)
		{
			var delta = [event.clientX-this.dragStart[0], event.clientY-this.dragStart[1]];
			var bestSlice;
			var bestProj = 50;
			for(var sliceNum in this.dragSlices)
			{
				var slice = this.dragSlices[sliceNum];
				var norm = this.dragNormals[sliceNum];
				var proj = delta[0]*norm[0]+delta[1]*norm[1];
				if(Math.abs(proj) > bestProj)
				{
					bestProj = Math.abs(proj);
					bestSlice = [slice[0],slice[1],proj>0];
				}
			}
			if(bestSlice != undefined)
			{
				this.addSliceRotation(bestSlice);
				this.dragStart = this.dragPos = this.dragSlices = undefined;
			}
		} else
		{
//			this.addRotation((event.clientX-this.dragStart[0])*this.lookSensitivity, (event.clientY-this.dragStart[1])*this.lookSensitivity);
			this.addSmartRotation((event.clientX-this.dragStart[0])*this.lookSensitivity, (event.clientY-this.dragStart[1])*this.lookSensitivity);
			this.dragStart = [event.clientX,event.clientY];
		}
	}
}

RubikCube.prototype.onMouseUp = function(event)
{
	this.dragStart = this.dragPos = this.dragSlices = undefined;
}

RubikCube.prototype.convertSlice = function(slice)
{
	slice = [this.convertFace(slice[0]),slice[1],slice[2]];
	if(slice[1]>=this.size/2) return [this.neighbors[slice[0]][0],this.size-slice[1]-1,!slice[2]];
	return slice;
}

RubikCube.prototype.getSliceElement = function(slice, face, n)
{
	var pos;
	for(var i=1; i<=4; i++)
	{
		if(this.neighbors[face][i] == slice[0])
		{
			pos = i;
			break;
		}
	}
	if(pos == undefined) return -1;	// bad face specified
	if(pos == 1) return slice[1]*this.size+n;
	if(pos == 2) return n*this.size+this.size-slice[1]-1;
	if(pos == 3) return (this.size-slice[1]-1)*this.size+(this.size-n-1);
	if(pos == 4) return (this.size-n-1)*this.size+slice[1];
}

RubikCube.prototype.multMatVec = function(m,v)
{
	var res = [0,0,0];
	for(var i=0; i<3; i++)
		for(var j=0; j<3; j++)
			res[i] += m[i][j]*v[j];
	return res;
}

RubikCube.prototype.multMatNum = function(m,n)
{
	var res = [];
	for(var i=0; i<3; i++)
	{
		res[i] = [];
		for(var j=0; j<3; j++)
			res[i][j] = m[i][j]*n;
	}
	return res;
}

RubikCube.prototype.multMatMat = function(m1,m2)
{
	var res = [];
	for(var i=0; i<3; i++)
	{
		res[i] = [];
		for(var j=0; j<3; j++)
		{
			var coef = 0;
			for(var k=0; k<3; k++)
				coef += m1[i][k]*m2[k][j];
			res[i][j] = coef;
		}
	}
	return res;
}

RubikCube.prototype.multVecNum = function(v,n)
{
	return [v[0]*n,v[1]*n,v[2]*n];
}

RubikCube.prototype.sumVec = function(v1,v2)
{
	return [v1[0]+v2[0],v1[1]+v2[1],v1[2]+v2[2]];
}

RubikCube.prototype.addRotation = function(x,y)
{
	var sinX = Math.sin(x);
	var sinY = Math.sin(y);
	var cosX = Math.cos(x);
	var cosY = Math.cos(y);
	this.matrix = this.multMatMat([[cosX,0,sinX],[0,1,0],[-sinX,0,cosX]], this.matrix);
	this.matrix = this.multMatMat([[1,0,0],[0,cosY,sinY],[0,-sinY,cosY]], this.matrix);
	this.bestFront = this.bestLeft = this.bestUp = undefined;
	this.norm = [];
	this.invalidate();
}

RubikCube.prototype.getRotationMatrix = function(v,angle)
{
	var sin = Math.sin(angle);
	var cos = Math.cos(angle);
	return [
		[v[0]*v[0]*(1-cos)+cos, v[0]*v[1]*(1-cos)-v[2]*sin, v[0]*v[2]*(1-cos)+v[1]*sin],
		[v[1]*v[0]*(1-cos)+v[2]*sin, v[1]*v[1]*(1-cos)+cos, v[1]*v[2]*(1-cos)-v[0]*sin],
		[v[2]*v[0]*(1-cos)-v[1]*sin, v[2]*v[1]*(1-cos)+v[0]*sin, v[2]*v[2]*(1-cos)+cos],
	];
}

RubikCube.prototype.normalizeMatrix = function(mat)
{
	var det = mat[0][0]*(mat[1][1]*mat[2][2]-mat[1][2]*mat[2][1])+mat[0][1]*(mat[1][2]*mat[2][0]-mat[1][0]*mat[2][2])+mat[0][2]*(mat[1][0]*mat[2][1]-mat[1][1]*mat[2][0]);
	det = Math.pow(det,1/3);
	return [
		[mat[0][0]/det, mat[0][1]/det, mat[0][2]/det],
		[mat[1][0]/det, mat[1][1]/det, mat[1][2]/det],
		[mat[2][0]/det, mat[2][1]/det, mat[2][2]/det]
	];
}

RubikCube.prototype.addSmartRotation = function(x,y)
{
	if(x==0 && y==0) return;
	if(Math.abs(x)>Math.abs(y))
		this.matrix = this.multMatMat(this.getRotationMatrix(this.getFaceNormal(this.convertFace("d")),x), this.matrix);
	else
		this.matrix = this.multMatMat(this.getRotationMatrix(this.getFaceNormal(this.convertFace("l")),y), this.matrix);
	this.matrix = this.normalizeMatrix(this.matrix);
	this.bestFront = this.bestLeft = this.bestUp = undefined;
	this.norm = [];
	this.invalidate();
}

RubikCube.prototype.getFaceElementCount = function(face)
{
	if(this.slice == undefined) return this.size*this.size;
	if(face>=12 && this.slice[1]==0) return 0;
	if(face%6==this.slice[0]) return (face>=12 || (face>=6 && this.slice[1]==0))?this.size*this.size:1;
	if(face%6==this.neighbors[this.slice[0]][0]) return face<6?this.size*this.size:1;
	if(face>=12) return this.slice[1]*this.size;
	if(face>=6) return this.size;
	return (this.size-this.slice[1]-1)*this.size;
}

RubikCube.prototype.getFaceNormal = function(face)
{
	if(this.norm[face] == undefined)
	{
		if((face>=6 && this.slice == undefined) || (face>=12 && this.slice[1]==0))
		{
			this.norm[face] = [0,0,-1];
		} else
		{
			if(face>=6)
			{
				if(face>=12 || face%6==this.slice[0] || face%6==this.neighbors[this.slice[0]][0])
					this.norm[face] = this.getFaceNormal(face%6);
				else
				{
					var nextFace;
					for(var i=1; i<=4; i++)
						if(this.neighbors[this.slice[0]][i]==face%6)
							nextFace = this.neighbors[this.slice[0]][i%4+1];
					this.norm[face] = this.multMatVec(this.matrix, this.sumVec(
						this.multVecNum(this.faceNormals[face%6],Math.cos(this.angle)),
						this.multVecNum(this.faceNormals[nextFace],Math.sin(this.angle))));
				}
			} else
				this.norm[face] = this.multMatVec(this.matrix,this.faceNormals[face]);
		}
	}
	return this.norm[face];
}

/**
 * Returns 3D-vector in screen coords of specified vertice of specified element of specified face
 * face ranges from 0 to 17
 * elementNum ranges from 0 to getFaceElementCount(face)-1
 * vertNum ranges from 0 to 3 (edges) or -1 (center)
 */
RubikCube.prototype.getElementVector = function(face, elementNum, vertNum)
{
	var norm = this.getFaceNormal(face);
	var normL = this.getFaceNormal(Math.floor(face/6)*6+this.neighbors[face%6][3]);
	var normU = this.getFaceNormal(Math.floor(face/6)*6+this.neighbors[face%6][2]);
	elementNum = this.convertElementNum(face, elementNum);
	if(this.slice!=undefined && ((face<6 || this.slice[1]>0) && face<12 && face%6==this.slice[0]) || (face>=6 && face%6==this.neighbors[this.slice[0]][0]))
	{
		var depth = face%6==this.slice[0]?this.size-this.slice[1]+Math.floor(face/6)-1:this.slice[1]-Math.floor(face/6)+2;
		var vertPos = this.multVecNum(norm, (depth/this.size*2-1));
		vertPos = this.sumVec(vertPos,this.multVecNum(normL,(vertNum==-1?0.5:Math.floor(vertNum/2))*2-1));
		vertPos = this.sumVec(vertPos,this.multVecNum(normU,(vertNum==-1?0.5:vertNum%2)*2-1));
		return vertPos;
	}
	var vertPos = norm;
	vertPos = this.sumVec(vertPos,this.multVecNum(normL,(Math.floor(elementNum/this.size)+(vertNum==-1?0.5:Math.floor(vertNum/2)))/this.size*2-1));
	vertPos = this.sumVec(vertPos,this.multVecNum(normU,(elementNum%this.size+(vertNum==-1?0.5:vertNum%2))/this.size*2-1));
	return vertPos;
}

RubikCube.prototype.getFaceZOrder = function(face)
{
	if(this.getFaceNormal(face)[2] < 0) return undefined;
	if(this.slice == undefined) return 1;
	var norm = this.getFaceNormal(this.slice[0]);
	return norm[2]<0?-face:face;
}

RubikCube.prototype.convertElementNum = function(face, elementNum)
{
	if(this.slice == undefined || face%6==this.slice[0] || face%6==this.neighbors[this.slice[0]][0]) return elementNum;
	if(face>=12) return this.getSliceElement([this.slice[0],Math.floor(elementNum/this.size)], face%6, elementNum%this.size);
	if(face>=6) return this.getSliceElement(this.slice, face%6, elementNum%this.size);
	return this.getSliceElement([this.slice[0],Math.floor(elementNum/this.size+this.slice[1]+1)], face, elementNum%this.size);
}

RubikCube.prototype.getElementFillStyle = function(face, elementNum)
{
	if(this.slice!=undefined && (face<6 || this.slice[1]>0) && face<12 && face%6==this.slice[0]) return this.innerColor;
	if(face>=6 && face%6==this.neighbors[this.slice[0]][0]) return this.innerColor;
	var state = this.state[face%6][this.convertElementNum(face, elementNum)];
	if(this.shiny == 0) return this.colors[state];
	var gradPos = this.getElementVector(face, elementNum, -1);
	var norm = this.getFaceNormal(face);
	gradPos = [(gradPos[0]-norm[0]/this.size/2)*this.scale+this.width/2,(gradPos[1]-norm[1]/this.size/2)*this.scale+this.height/2];
	var fillStyle = this.ctx.createRadialGradient(gradPos[0],gradPos[1],0,gradPos[0],gradPos[1],this.scale/this.size/this.shiny);
	fillStyle.addColorStop(0,this.colors[state]);
	fillStyle.addColorStop(1,"black");
	return fillStyle;
}
