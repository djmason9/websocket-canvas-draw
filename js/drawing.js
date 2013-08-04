/*global $, io*/
/*jslint sloppy:true,plusplus:true,vars:true,white:true,nomen:true,devel:true,browser:true,node:true,undef:true*/
/**
 * Main Application Function
 * @param {Object} options
 */
DrawingPad = function(options) { 
	"use strict";
	var defaults = {
		width : 500,
		height : 500,
		defaultColor : "#00000",
		defaultStroke : 4
	}, 
	tools = [
		"share",
		"draw",
		"line",
		"trash",
		"save"
	],
	settings = $.extend(defaults, options), 
	DP={};
	DP.points=[];
	
	DP.isTouchDevice = 'ontouchstart' in document.documentElement;
	
	/////////////\ SOCKET.IO CALLBACKS \/////////////
	
	/**
	 * Remote user has cleared their canvas so clear the one your looking at too
	 * @param {Object} data
	 */
	function eraseShared(data){
		if(DP.thisObj[data.id]){
			DP.thisObj[data.id].ctx.clearRect(0, 0, DP.myCanvas.width, DP.myCanvas.height);
		}
	}
	
	/**
	 * After getting the latest id's from the server it 
	 * builds a list with those names
	 * @param {Object} data
	 */
	function setUserList(data){
		
		//Build HTML
		$("body").append(_buildUsersList(data));
		$('.userListWrapper').on('shown', function () {
			$(".userList li").click(function(){
				//announce new user added
				DP.thisObj.socket.emit('requestShare', {senderId : DP.thisObj.id, listenerId : $(this).attr("data-id"), senderName : DP.myName}); //callback createNewClient
			});
		});
		$('.userListWrapper').modal("show");
	}
	
	/**
	 * A shared user has refreshed there screen or 
	 * navigated away so their shared canvas is no longer needed
	 * @param {Object} data
	 */
	function deleteShared(data){
		DP.thisObj.find("#" + data.id).remove();
	}
	/**
	 * Alerts you that another user would like to share. Builds a new canvas on that users instance if you accept.
	 * @param {Object} data
	 */
	function createNewClient(data){
		
		if(DP.thisObj.id === data.listenerId && !DP.thisObj[data.senderId]){ //test to see if this instance is the one i want.
			if(confirm(data.senderName + " wants to share their canvas.")){
				DP.thisObj.socket.emit('confirmShare', {isSharing : true, senderId : data.senderId, listenerId : DP.thisObj.id, senderName : DP.myName});
				DP.isSharing = true; //you are now sharing
				_createSharedCanvas(data.senderId);
			} else { //not sharing
				DP.thisObj.socket.emit('confirmShare', {isSharing : false, senderId : data.senderId, listenerId : DP.thisObj.id, senderName : DP.myName});
			}
		}
	}
	
	/**
	* Alerts you that a user has decided to share with you
	* @param {Object} data
	*/
	function setConfirmShare(data){
		var message="";
		
		if(DP.thisObj.id === data.senderId){
			if(data.isSharing){
				message = data.senderName + " has agreed to share.";
				//create new canvas
				DP.isSharing = true;
				_createSharedCanvas(data.listenerId);
			} else {
				message = data.senderName + " has NOT agreed to share.";
			}
			alert(message);
		}
	}
	/**
	 * draws on your's and the shared canvas 
	 * @param {Object} data
	 */
	function draw(data, fromMe){

		if(DP.thisObj[data.id]){
			var eventType = _eventTypes(data.isTouchDevice),
			ctx = DP.thisObj[data.id].ctx,
			scratchCtx = DP.thisObj.scratch.ctx;
			
			//set the ctx
			ctx.strokeStyle = data.color;
			ctx.lineWidth = data.stroke;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			
			scratchCtx.strokeStyle = data.color;
			scratchCtx.lineWidth = data.stroke;
			scratchCtx.lineCap = "round";
			scratchCtx.lineJoin = "round";
			
			if(data.isErase){
				ctx.globalCompositeOperation = "destination-out";
				scratchCtx.globalCompositeOperation = "destination-out";
			} else {
				ctx.globalCompositeOperation = "source-over";
				scratchCtx.globalCompositeOperation = "source-over";
			}


			if (data.type === eventType.down) {		
				DP.okToDraw = true;
				if(fromMe && !data.isLineDrawing){
					DP.points.push({x : data.x, y : data.y});
				} else if(data.isLineDrawing) {	//for line drawing we only need the coords
					DP.thisObj[data.id].x = data.x;
					DP.thisObj[data.id].y = data.y;
				} else { //from a shared canvas
					ctx.beginPath();
					ctx.moveTo(data.x, data.y);
				}
			} else if ((data.type === eventType.move) && DP.okToDraw) {
				
				
			    if(data.isLineDrawing && fromMe) {	//draw the line on a temp canvas
					scratchCtx.clearRect(0, 0, DP.myCanvas.width, DP.myCanvas.height);
					scratchCtx.beginPath();
					scratchCtx.moveTo(DP.thisObj[data.id].x, DP.thisObj[data.id].y);
					scratchCtx.lineTo(data.x, data.y);
					scratchCtx.stroke();
				} else if(fromMe){
					scratchCtx.clearRect(0, 0, DP.myCanvas.width, DP.myCanvas.height); 
					DP.points.push({x : data.x, y : data.y});
					_drawPoints(scratchCtx);
				} else if(!data.isLineDrawing) { //this is coming from drawing a shared canvas
					ctx.lineTo(data.x, data.y);
					ctx.stroke();
				}
			} else if(data.type === eventType.up){
				if(data.isLineDrawing) {	//when done put the scratch line on the scratch canvas
					ctx.beginPath();
					ctx.moveTo(DP.thisObj[data.id].x, DP.thisObj[data.id].y);
					ctx.lineTo(data.x, data.y);
					ctx.stroke();
					ctx.closePath();
					scratchCtx.clearRect(0, 0, DP.myCanvas.width, DP.myCanvas.height);
				} else if(fromMe){  
					ctx.drawImage(DP.scratchCanvas, 0, 0);
					scratchCtx.clearRect(0, 0, DP.myCanvas.width, DP.myCanvas.height);
				} else {
					ctx.closePath();
				}
				DP.okToDraw = false;
				scratchCtx.closePath();
				
				DP.points = [];
			}
		}
	
	}
	
	//////////////////\ PRIVATE METHODS \////////////////
	/**
	 * Simple Random Id Generator
	 * @param {int} strLength
	 */
	function _randomString(strLength) {
		var chars = "ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz", randomstring = '', rnum, i;
		if (strLength === undefined) {
			strLength = 5;
		}
		for ( i = 0; i < strLength; i++) {
			rnum = Math.floor(Math.random() * chars.length);
			randomstring += chars.substring(rnum, rnum + 1);
		}
		return randomstring;
	}
	
	/**
	 * Creates a shared Canvas instance
	 * @param {int} id
	 */
	function _createSharedCanvas(id) {

		if (!DP.thisObj[id]) {
			var sharedCanvas = document.createElement('canvas'),
			canvas = DP.thisObj.find("#" + DP.thisObj.id);
			
			sharedCanvas.id = id;
			sharedCanvas.width = canvas.width();
			sharedCanvas.height = canvas.height();

			$(sharedCanvas).addClass("sharedCanvas");

			DP.thisObj[id] = {};
			DP.thisObj[id].ctx = sharedCanvas.getContext('2d');

			$(DP.thisObj).append(sharedCanvas);
		}
	}
	
	/**
	 * Builds the tool bar HTML
	 */
	function _buildToolBar(){
		var i, 
		len = tools.length,
		tool="";
		for(i=0; i < len;i+=1) {
			tool +=  "<li data-toggle='tooltip' data-placement='right' data-original-title='" + tools[i] + "' class='sprite " + tools[i] + "'></li>"; 
		}
		
		return "<ul class='toolbar'>" + tool + "</ul>";
	}
	/**
	 * Builds a model box for user to create a user name.
	 */
	function _buildUserCreate(){
		return '<div class="modal fade userNameModal">' +
		'<div class="modal-header">' +
		'<h3>Create a user name.</h3>' +
		'</div>' +
		'<div class="modal-body">' +
		'<input type="text" size="30" name="name" class="userNameInput">' +
		'</div>' +
		'<div class="modal-footer">' +
		'<a href="#" class="btn confirm" data-dismiss="modal">Confirm</a>' +
		'</div>' +
		'</div>';
	}
	
	/**
	 * Builds a User list
	 * @param {Object} userList
	 */
	function _buildUsersList(userList){
		var uList="", key="", clientCount=0, modal;
		
		
		for(key in userList) {
			var sharing = "";
			if(userList[key].id !== DP.thisObj.id){
				
				DP.thisObj[key]? sharing = " - ( X )" : sharing = "";
				uList += "<li data-dismiss='modal' data-id='" + userList[key].id + "'>" + userList[key].senderName + sharing + "</li>";
				clientCount++;
			}
		}
		//clear any old lists
		$(".userListWrapper").remove();
		
		//create modal
		modal = '<div class="modal fade userListWrapper">' +
		'<div class="modal-header">' +
		'<h3>Users to share with</h3>' +
		'</div>' +
		'<div class="modal-body">' +
		'<ul class="userList">' + uList + '</ul>' +
		'</div>' +
		'<div class="modal-footer">' +
		'<a href="#" class="btn" data-dismiss="modal">Close</a>' +
		'</div>' +
		'</div>';

		if(clientCount === 0) {
			alert("There are no other users at this time.");
		}
		
		return clientCount > 0 ? modal : ""; //only show this if there are users to share with
		
	}
	/**
	 * Maps Coords to mouse location.
	 */
	function _getCoords(e) {
		var _x = 0, _y = 0;
		if(e.touches){ //android
			if(e.touches.length > 0){
				_x = e.touches[0].pageX - $(DP.myCanvas).offset().left;
				_y = e.touches[0].pageY - $(DP.myCanvas).offset().top;
			} else {
				_x = e.pageX - $(DP.myCanvas).offset().left;
				_y = e.pageY - $(DP.myCanvas).offset().top;
			}
		} else if (e.layerX || e.layerX === 0) {// Firefox
			_x = e.layerX;
			_y = e.layerY;
		} else {
			_x = e.pageX - $(DP.myCanvas).offset().left;
			_y = e.pageY - $(DP.myCanvas).offset().top;
		}

		return {
			"x" : _x,
			"y" : _y
		};
	}
	
	/**
	 * Determine event types and assigns the correct event types
	 */
	function _eventTypes(isTouchDevice){
		return {
			down : isTouchDevice? "touchstart" : "mousedown",
			move : isTouchDevice? "touchmove" : "mousemove",
			up : isTouchDevice? "touchend" : "mouseup",
			out : "mouseout"
		};
	}
	
	/**
	 * Adds the event handlers to everything
	 */
	function _setEventHandlers(){
		var eventType = _eventTypes(DP.isTouchDevice),
		events = eventType.down + " " + eventType.move + " " + eventType.up + " " + eventType.out;
		
		window.onunload = function(e) {
			DP.thisObj.socket.emit('deleteSharedById', {id : DP.thisObj.id});
		};
		
		$(".toolbar li").tooltip(options);
		
		//events for tool bar
		$(".toolbar").find(".sprite").click(function(){
			DP.isDrawing = false;
			DP.isLineDrawing = false;
			DP.isType = false;
			//clear selected
			$(".sprite").removeClass("selected");
			if($(this).hasClass(tools[0])){			//share
				//Get Users List
				DP.thisObj.socket.emit("getUserList");
			} else if($(this).hasClass(tools[1])){		//draw
				$(this).addClass("selected");
				DP.isDrawing = true;
			} else if($(this).hasClass(tools[2])){		//line
				$(this).addClass("selected");
				DP.isLineDrawing = true;
			} else if($(this).hasClass(tools[3])){		//trash
				$("body").prepend('<div class="alert alert-block alert-error fade in">' +
				'<h4>Oh Snap you sure?!</h4>' +
				'<p>Are you sure you want to clear your drawpad.</p><br/>' +
				'<a class="btn btn-danger" href="#" data-dismiss="alert">Clear Drawing</a> <a class="btn btn-default" href="#" data-dismiss="alert">NO don\'t!</a>' +
				'</div>');
				$(".btn-danger").click(function(){
					DP.thisObj[DP.thisObj.id].ctx.clearRect(0, 0, DP.myCanvas.width, DP.myCanvas.height);
					DP.thisObj.socket.emit("eraseRequestById",{id : DP.thisObj.id});
				});
				$(".alert").show().alert();
			}
		}).hover(function(){
			$(this).addClass("hover");
		},function(){
			$(this).removeClass("hover");
		});
		
		DP.thisObj.find(".myCanvas").bind(events, function(e){
			e.preventDefault();
			if(DP.isDrawing || DP.isLineDrawing) {
				var coords = _getCoords(DP.isTouchDevice?e.originalEvent:e),
				data = {
					x: coords.x,
					y: coords.y,
					type: e.type,
					isTouchDevice : DP.isTouchDevice,
					color: DP.thisObj[DP.thisObj.id].ctx.strokeStyle,
					stroke : DP.thisObj[DP.thisObj.id].ctx.lineWidth,
					isLineDrawing : DP.isLineDrawing,
					isErase : DP.isErase,
					id : DP.thisObj.id
				};
				
				draw(data, true);
				
				if(DP.okToDraw || e.type === eventType.up) {
					DP.isSharing ? DP.thisObj.socket.emit('drawRequest', data) : "";
				}
			}
		});
		
	}
	/**
	 * Smoothes out the line your drawing.
	 * @param {Object} ctx 
	 */
	function _drawPoints(ctx) {
		var i, len, c, d;
		if (DP.points.length < 3) {
			return;
		}

		ctx.beginPath();
		ctx.moveTo(DP.points[0].x, DP.points[0].y);

		len = (DP.points.length -2);

		for ( i = 1; i < len; i++) {
			c = ((DP.points[i].x + DP.points[i + 1].x) / 2);
			d = ((DP.points[i].y + DP.points[i + 1].y) / 2);
			ctx.quadraticCurveTo(DP.points[i].x, DP.points[i].y, c, d);
		}

		ctx.quadraticCurveTo(DP.points[i].x, DP.points[i].y, DP.points[i + 1].x, DP.points[i + 1].y);
		ctx.stroke();
	}
	//////////////////\ START PUBLIC METHODS \////////////////
	
	/**
	 * Init DrawingPad
	 */
	this.init = function(selector) {
		
		var id = _randomString(10);
		DP.myCanvas = document.createElement('canvas');
		DP.scratchCanvas = document.createElement('canvas'); 
		DP.thisObj = $(selector);
		DP.thisObj.id = id;

		DP.myCanvas.id = id;
		DP.myCanvas.width = settings.width;
		DP.myCanvas.height = settings.height;
		DP.thisObj[id] = {}; //create new obj
		DP.thisObj[id].ctx = DP.myCanvas.getContext('2d');
		DP.thisObj[id].ctx.strokeStyle = settings.defaultColor;
		DP.thisObj[id].ctx.lineWidth = settings.defaultStroke;
		
		//
		DP.scratchCanvas.id = "scratchId";
		DP.scratchCanvas.width = DP.myCanvas.width;
		DP.scratchCanvas.height = DP.myCanvas.height;
		DP.thisObj.scratch = {};
		DP.thisObj.scratch.ctx = DP.scratchCanvas.getContext('2d');
		DP.thisObj.scratch.ctx.strokeStyle = settings.defaultColor;
		DP.thisObj.scratch.ctx.lineWidth = settings.defaultStroke;
		
		$(DP.myCanvas).addClass("myCanvas");
		$(DP.scratchCanvas).addClass("myCanvas");

		$(selector).append(DP.scratchCanvas); //add canvas to DOM
		$(selector).append(DP.myCanvas); //add canvas to DOM
		$(selector).append(_buildToolBar); //add tool bar to DOM
		
		//register socket listeners
		DP.thisObj.socket = io.connect("http://localhost:4000");
	
	    DP.thisObj.socket.on('setUserList', function(data) {
			return setUserList(data); //show pop up list
		});
		
		DP.thisObj.socket.on('draw', function(data) {
			return draw(data);
	    });
	    
	    DP.thisObj.socket.on('eraseShared', function(data) {
			return eraseShared(data);
		});
		
		DP.thisObj.socket.on('createNewClient', function(data) {
			return createNewClient(data);
	    });
	    
	    DP.thisObj.socket.on('deleteShared', function(data) {
			return deleteShared(data); //remove shared canvas
		});
		
		DP.thisObj.socket.on('setConfirmShare', function(data) {
			return setConfirmShare(data);
	    });
		
		//set event handlers
		_setEventHandlers();
		
		$("body").append(_buildUserCreate());
		$('.userNameModal').on('shown', function () {
			$(".confirm").click(function(){
				DP.myName = $(".userNameInput").val().trim();
				//tell the server i'm here
				DP.thisObj.socket.emit('setClientId', {id : id, senderName : DP.myName});
			});
		});
		$('.userNameModal').modal("show");
	};
};

