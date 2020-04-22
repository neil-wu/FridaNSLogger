export function swapInt16(val: number) {
  return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}
export function swapInt32(val: number) {
  return (
    ((val & 0xff) << 24) |
    ((val & 0xff00) << 8) |
    ((val & 0xff0000) >> 8) |
    ((val >> 24) & 0xff)
  );
}
export function swapInt64(val: Int64) {
  var vh: number = val.and(0xffffffff).toNumber();
  var vl: number = val.shr(32).and(0xffffffff).toNumber();

  var reth = new Int64(swapInt32(vh)).shl(32);
  var retl = new Int64(swapInt32(vl));
  return reth.add(retl);
}

// Constants for the "part key" field
const enum LogPartKey {
  MessageType = 0,
  TimestampS = 1, // "seconds" component of timestamp
  TimestampMS = 2, // milliseconds component of timestamp (optional, mutually exclusive with part_key_timestamp_us)
  TimestampUS = 3, // microseconds component of timestamp (optional, mutually exclusive with part_key_timestamp_ms)
  ThreadId = 4,
  Tag = 5,
  Level = 6,
  Message = 7,
  ImageWidth = 8, // messages containing an image should also contain a part with the image size
  ImageHeight = 9, // (this is mainly for the desktop viewer to compute the cell size without having to immediately decode the image)
  MessageSeq = 10, // the sequential number of this message which indicates the order in which messages are generated
  Filename = 11, // when logging, message can contain a file name
  Linenumber = 12, // as well as a line number
  Functionname = 13, // and a function or method name

  // constants for parts in logmsg_type_clientinfo
  ClientName = 20,
  ClientVersion = 21,
  OSName = 22,
  OSVersion = 23,
  ClientModel = 24, // for iphone, device model (i.e 'iphone', 'ipad', etc)
  UniqueId = 25, // for remote device identification, part of logmsg_type_clientinfo

  UserDefined = 100, //Area starting at which you may define your own constants
}

export const enum LogPartType {
  String = 0, // Strings are stored as UTF-8 data
  Binary = 1, // A block of binary data
  Int16 = 2,
  Int32 = 3,
  Int64 = 4,
  //Image = 5, // An image, stored in PNG format
}
export const enum LogLevel {
  Error = 0,
  Warning = 1,
  important = 2,
  Info = 3,
  Debug = 4,
  Verbose = 5,
  Noise = 6,
}
export const enum LogMsgType {
  Log = 0, // a standard log message
  Blockstart = 1, // the start of a "block" (a group of log entries)
  Blockend = 2, // the end of the last started "block"
  Clientinfo = 3, // information about the client app
  Disconnect = 4, // pseudo-message on the desktop side to identify client disconnects
  Mark = 5, // pseudo-message that defines a "mark" that users can place in the log flow
}

export class LogMessage {
  private logParts: LogMessagePart[];
  private partTotoalBytes: number;
  constructor() {
    //this.name = name;
    this.logParts = [];
    this.partTotoalBytes = 0;
  }
  add(part: LogMessagePart) {
    this.logParts.push(part);
    this.partTotoalBytes += part.getBytes();
  }
  addTimestampPart() {
    const timestamp = Date.now();
    this.add(
      new LogMessagePart(LogPartKey.TimestampS, LogPartType.Int64, timestamp / 1000)
    );
    this.add(
      new LogMessagePart(LogPartKey.TimestampMS, LogPartType.Int64, timestamp % 1000)
    );
  }
  pack(): ArrayBuffer {
    const partNum: number = this.logParts.length;
    const bufLen: number = 4 + 2 + this.partTotoalBytes;
    const buf: NativePointer = Memory.alloc(bufLen);
    var bufPtr: NativePointer = buf
      .writeS32(swapInt32(2 + this.partTotoalBytes))
      .add(4)
      .writeS16(swapInt16(partNum))
      .add(2);
    var i: number = 0;
    for (i = 0; i < partNum; i++) {
      const part = this.logParts[i];
      bufPtr = bufPtr.writeByteArray(part.toArrayBuffer()).add(part.getBytes());
    }
    return buf.readByteArray(bufLen) as ArrayBuffer;
  }
}

export class LogMessagePart {
  private buf: NativePointer;
  private bytes: number;
  constructor(key: LogPartKey, type: LogPartType, value: any) {
    //build
    const valueLen = this.getTypeValueLen(type, value);
    this.bytes = 2 + valueLen;
    this.buf = Memory.alloc(this.bytes);
    var bufPtr = this.buf.writeS8(key).add(1).writeS8(type).add(1);
    this.packTypeValue(bufPtr, type, value);
  }
  getBytes(): number {
    return this.bytes;
  }
  toArrayBuffer(): ArrayBuffer {
    return this.buf.readByteArray(this.bytes) as ArrayBuffer;
  }

  dump(prefix: string = "") {
    console.log(prefix + hexdump(this.buf, { offset: 0, length: this.bytes }));
  }

  private getTypeValueLen(type: LogPartType, value: any): number {
    var valueLen: number = 0;
    if (type === LogPartType.String) {
      const str = value as string;
      valueLen = 4 + str.length;
    } else if (type === LogPartType.Int16) {
      valueLen = 2;
    } else if (type === LogPartType.Int32) {
      valueLen = 4;
    } else if (type === LogPartType.Int64) {
      valueLen = 8;
    } else if (type === LogPartType.Binary) {
      valueLen = 4 + (value as ArrayBuffer).byteLength;
    }
    //TODO: Image
    return valueLen;
  }
  private packTypeValue(
    bufPtr: NativePointer,
    type: LogPartType,
    value: any
  ): NativePointer {
    var retPtr: NativePointer = bufPtr;
    if (type === LogPartType.String) {
      const str = value as string;
      retPtr = bufPtr
        .writeS32(swapInt32(str.length))
        .add(4)
        .writeUtf8String(str)
        .add(str.length);
    } else if (type === LogPartType.Int16) {
      retPtr = bufPtr.writeS16(swapInt16(value as number)).add(2);
    } else if (type === LogPartType.Int32) {
      retPtr = bufPtr.writeS32(swapInt32(value as number)).add(4);
    } else if (type === LogPartType.Int64) {
      var sval: string = "";
      if (typeof value === "number") {
        sval = "0x" + (value as number).toString(16);
      } else {
        sval = value as string;
      }
      const tmp: Int64 = new Int64(sval); // must init from hex string ('0x01020304')
      retPtr = bufPtr.writeS64(swapInt64(tmp)).add(8);
    } else if (type === LogPartType.Binary) {
      const arrBuf = value as ArrayBuffer;
      const arrBufLen = arrBuf.byteLength;
      retPtr = bufPtr
        .writeS32(swapInt32(arrBufLen))
        .add(4)
        .writeByteArray(arrBuf)
        .add(arrBufLen);
    }
    //TODO: Image
    return retPtr;
  }
}

//---------------------------
function buildDeviceInfo(): ArrayBuffer {
  var msg = new LogMessage();
  msg.addTimestampPart();
  msg.add(
    new LogMessagePart(LogPartKey.MessageType, LogPartType.Int32, LogMsgType.Clientinfo)
  ); //client info
  msg.add(
    new LogMessagePart(
      LogPartKey.ClientVersion,
      LogPartType.String,
      "Frida" + Frida.version
    )
  );
  msg.add(
    new LogMessagePart(LogPartKey.ClientName, LogPartType.String, "pid" + Process.id)
  );
  msg.add(
    new LogMessagePart(
      LogPartKey.OSName,
      LogPartType.String,
      Process.platform + "_" + Process.arch
    )
  );

  const buffer = msg.pack();
  //log(hexdump(buffer, { ansi: true }));
  return buffer;
}

const enum LoggerState {
  Disconnect = 0,
  Connecting = 1,
  Connected = 2,
}

export class Logger {
  private socket?: SocketConnection;
  private host: string;
  private port: number;
  private cachePkgs: ArrayBuffer[];
  private state: LoggerState;
  private prePkgSendDone: Boolean; //queue the pkgs to be sent
  private seq: number;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.cachePkgs = [];
    this.state = LoggerState.Disconnect;
    this.seq = 0;
    this.prePkgSendDone = true;
  }

  private tryConnect() {
    if (this.state == LoggerState.Disconnect) {
      this.state = LoggerState.Connecting;
      console.log(`Logger tryConnect to ${this.host}:${this.port}...`);
      Socket.connect({ family: "ipv4", host: this.host, port: this.port, tls: false })
        .then((connect) => {
          this.socket = connect;
          this.state = LoggerState.Connected;
          console.log("Logger connect success");
          const deviceBuf = buildDeviceInfo();
          this.send(deviceBuf);
        })
        .catch((err) => {
          this.socket = undefined;
          this.state = LoggerState.Disconnect;
          console.log("Logger connect fail, err?", err);
        });
    }
  }

  logStr(str: string) {
    const pkg = this.buildLog(str);
    this.logPkg(pkg);
  }
  logBinary(data: ArrayBuffer) {
    const pkg = this.buildLog(data);
    this.logPkg(pkg);
  }
  logPkg(pkg: ArrayBuffer) {
    if (this.socket == undefined) {
      this.tryConnect();
      //cache pkg
      this.cachePkgs.push(pkg);
    } else {
      this.send(pkg);
    }
  }

  private send(pkg: ArrayBuffer | undefined) {
    if (this.socket == undefined || pkg == undefined) {
      return;
    }
    if (!this.prePkgSendDone) {
        this.cachePkgs.push(pkg);
        return;
    }
    this.prePkgSendDone = false;
    this.socket.output
      .write(pkg)
      .then((val) => {
        this.prePkgSendDone = true;
        const first = this.cachePkgs.shift();
        this.send(first); //send next pkg
      })
      .catch((err) => {
        console.log("send fail:", err); //Error: Error sending data: Broken pipe
        this.socket = undefined;
        this.state = LoggerState.Disconnect;
        this.prePkgSendDone = true; //reset
      });
  }
  private buildLog(data: string | ArrayBuffer) {
    var msg = new LogMessage();
    msg.addTimestampPart();
    msg.add(
      new LogMessagePart(LogPartKey.MessageType, LogPartType.Int32, LogMsgType.Log)
    ); //log message
    msg.add(new LogMessagePart(LogPartKey.Tag, LogPartType.String, "FridaLog"));
    msg.add(new LogMessagePart(LogPartKey.MessageSeq, LogPartType.Int32, this.seq++));
    msg.add(new LogMessagePart(LogPartKey.Level, LogPartType.Int64, LogLevel.Info)); //3=info
    //
    if (typeof data === "string") {
      const str = data as string;
      msg.add(new LogMessagePart(LogPartKey.Message, LogPartType.String, str));
    } else {
      const arrBuf = data as ArrayBuffer;
      msg.add(new LogMessagePart(LogPartKey.Message, LogPartType.Binary, arrBuf));
    }
    const buffer = msg.pack();
    //log(hexdump(buffer, { ansi: true }));
    return buffer;
  }
}
