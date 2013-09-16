#!/usr/bin/env node

"use strict";
Error.stackTraceLimit = -1;

var Slice = function(data, length, capacity) {
  capacity = capacity || length || 0;
  data = data || new Array(capacity);
  this.array = data;
  this.offset = 0;
  this.length = data.length;
  if (length !== undefined) {
    this.length = length;
  }
};

Slice.prototype.len = function() {
  return this.length;
};

Slice.prototype.cap = function() {
  return this.array.length;
};

Slice.prototype.get = function(index) {
  return this.array[this.offset + index];
};

Slice.prototype.set = function(index, value) {
  this.array[this.offset + index] = value;
};

Slice.prototype.subslice = function(begin, end) {
  var s = new this.constructor(this.array);
  s.offset = this.offset + begin;
  s.length = this.length - begin;
  if (end !== undefined) {
    s.length = end - begin;
  }
  return s;
};

Slice.prototype.toArray = function() {
  return this.array.slice(this.offset, this.offset + this.length);
};

String.prototype.len = function() {
  return this.length;
};

String.prototype.toSlice = function() {
  var array = new Int32Array(this.length);
  for (var i = 0; i < this.length; i++) {
    array[i] = this.charCodeAt(i);
  }
  return new Slice(array);
};

var Map = function(data, capacity) {
  this.data = data;
};

Map.prototype.len = function() {
  return Object.keys(this.data).length;
};

var Interface = function(value) {
  return value;
};

var Channel = function() {};

var _Pointer = function(getter, setter) { this.get = getter; this.set = setter; };

var copy = function(dst, src) {
  var n = Math.min(src.length, dst.length);
  for (var i = 0; i < n; i++) {
    dst.set(i, src.get(i));
  }
  return n;
};

// TODO improve performance by increasing capacity in bigger steps
var append = function(slice, toAppend) {
  var newArray = slice.array;
  var newOffset = slice.offset;
  var newLength = slice.length + toAppend.length;

  if (slice.offset + newLength > newArray.length) {
    newArray = new newArray.constructor(newLength);
    for (var i = 0; i < slice.length; i++) {
      newArray[i] = slice.array[slice.offset + i];
    }
    newOffset = 0;
  }

  for (var j = 0; j < toAppend.length; j++) {
    newArray[newOffset + slice.length + j] = toAppend.get(j);
  }

  var newSlice = new slice.constructor(newArray);
  newSlice.offset = newOffset;
  newSlice.length = newLength;
  return newSlice;
};

var GoError = function(value) {
  this.value = value;
  Error.captureStackTrace(this);
};
GoError.prototype.toString = function() {
  return this.value;
}

var _error_stack = [];

// TODO inline
var callDeferred = function(deferred) {
  for (var i = deferred.length - 1; i >= 0; i--) {
    var call = deferred[i];
    try {
      call.fun.apply(call.recv, call.args);
    } catch (err) {
      _error_stack.push({ frame: getStackDepth(), error: err });
    }
  }
  var err = _error_stack[_error_stack.length - 1];
  if (err !== undefined && err.frame === getStackDepth()) {
    _error_stack.pop();
    throw err.error;
  }
}

var recover = function() {
  var err = _error_stack[_error_stack.length - 1];
  if (err === undefined || err.frame !== getStackDepth() - 2) {
    return null;
  }
  _error_stack.pop();
  return err.error.value;
};

var getStackDepth = function() {
  var s = (new Error()).stack.split("\n");
  var d = 0;
  for (var i = 0; i < s.length; i++) {
    if (s[i].indexOf("callDeferred") == -1) {
      d++;
    }
  }
  return d;
};

var _isEqual = function(a, b) {
  if (a === null || b === null) {
    return a === null && b === null;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === Number || a.constructor === String) {
    return a === b;
  }
  throw new Error("runtime error: comparing uncomparable type " + a.constructor);
};

var print = function(a) {
  console.log(a.toArray().join(" "));
};

var println = print;

var Integer = function() {};
var Float = function() {};
var Complex = function() {};

var typeOf = function(value) {
  var type = value.constructor;
  if (type === Number) {
    return (Math.floor(value) === value) ? Integer : Float;
  }
  return type;
};

var typeAssertionFailed = function() {
  throw new Error("type assertion failed");
};

var cast = function(type, value) {
  switch (type) {
  case String:
    switch (value.constructor) {
    case Number:
      return String.fromCharCode(value);
    case Slice:
      return String.fromCharCode.apply(null, value.toArray());
    default:
      if (value.v === undefined) {
        throw new Error("Can not cast to string: " + value.constructor);
      }
      return value.v;
    }
  case Integer:
    if (value.constructor !== Number) {
      return Math.floor(value.v);
    }
    return Math.floor(value);
  case Float:
    if (value.constructor !== Number) {
      return value.v;
    }
    return value;
  default:
    throw new Error("Can not cast.")
  }
};

var newNumericArray = function(len) {
  var a = new Array(len);
  for (var i = 0; i < len; i++) {
    a[i] = 0;
  }
  return a;
};

var packages = {};

packages["fmt"] = {
  Print: print,
  Println: print,
  Printf: function(format, a) {
    var array = a.toArray();
    array.unshift(format);
    console.log(array.join(" "));
  },
  Sprint: function(a) {
    var parts = [];
    for (var i = 0; i < a.length; i++) {
      parts.push(a.get(i).toString());
    }
    return parts.join("");
  },
  Sprintf: function(format, a) {
    return this.Sprint(a);
  }
};

packages["os"] = {
  Exit: process.exit,
  Getenv: function(name) {
    var value = process.env[name];
    if (value === undefined) {
      return "";
    }
    return value;
  }
};

packages["errors"] = {
  New: function(msg) {
    return new Error(msg);
  }
};

packages["utf8"] = {
  DecodeRuneInString: function(str) {
    return str.charCodeAt(0);
  }
};

packages["reflect"] = {
  DeepEqual: function(a, b) {
    if (a === b) {
      return true;
    }
    if (a.constructor === Number) {
      return false;
    }
    if (a.constructor !== b.constructor) {
      return false;
    }
    if (a.length !== undefined) {
      if (a.length !== b.length) {
        return false;
      }
      for (var i = 0; i < a.length; i++) {
        if (!this.DeepEqual(a.get(i), b.get(i))) {
          return false;
        }
      }
      return true;
    }
    var keys = Object.keys(a);
    for (var j = 0; j < keys.length;  j++) {
      if (!this.DeepEqual(a[keys[j]], b[keys[j]])) {
        return false;
      }
    }
    return true;
  },
  TypeOf: function(v) {
    return {
      Bits: function() { return 32; }
    };
  },
  flag: function() {},
  Value: function() {},  
};

packages["runtime"] = {
  SetFinalizer: function() {}
};

packages["sync"] = {
  Mutex: function() {}
};
packages["sync"].Mutex.prototype.Lock = function() {};
packages["sync"].Mutex.prototype.Unlock = function() {};

packages["sync/atomic"] = {
  StoreInt32: function() {}
}

packages["syscall"] = {
  Stdin: 0,
  Stdout: 1,
  Stderr: 2,
  Write: function(fd, p) {
    process.stdout.write(String.fromCharCode.apply(null, p.toArray()));
    return [p.length, null]
  },
  Errno: function(v) { this.v = v; },
  Signal: function() {}
};

