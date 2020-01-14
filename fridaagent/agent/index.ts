import { Logger } from "./logger";
import { swapInt64 } from "./logger";

console.log('----->' + Date.now())

const logger = new Logger('127.0.0.1', 50010);

logger.logStr('helloworld');

const testS64 = new Int64('0x0102030405060708');
const testBuf = Memory.alloc(8).writeS64( swapInt64(testS64) ).readByteArray(8);
logger.logBinary(testBuf as ArrayBuffer);

var cnt = 0;
setInterval( ()=>{
    logger.logStr('helloworld_' + cnt++);
}, 2000 );


/*
00000073
000a //0xa=10 parts
0104 00000000 5e13fedb //
0304 00000000 00011402 //PART_KEY_TIMESTAMP_US

0400 00000008 54687265 61642036  //PART_KEY_THREAD_ID   
0003 00000003 // PART_KEY_MESSAGE_TYPE  PART_TYPE_INT32 // log_level

1500 00000001 31 //0x15=21,PART_KEY_CLIENT_VERSION
1400 0000000f 4e534c6f6767657254657374417070 // 0x14=20,PART_KEY_CLIENT_NAME //NSLoggerTestApp
1900 00000008 6950686f 6e652058 //PART_KEY_UNIQUEID //iPhone X
1700 00000004 31322e32  //PART_KEY_OS_VERSION 12.2
1600 00000003 694f53 //PART_KEY_OS_NAME iOS
1800 00000006 6950686f6e65  //PART_KEY_CLIENT_MODEL iPhone
*/

