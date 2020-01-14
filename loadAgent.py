#!/usr/local/bin/python3
#! -*- coding: utf-8 -*-

from __future__ import print_function
import frida
import sys
import codecs

# appname = "testproj"
#pid = frida.get_usb_device().get_process(appname).pid
#session = frida.get_usb_device().attach(pid) #get usb
#print('pid', pid)

session = frida.attach('计算器')

with codecs.open('./fridaagent/_agent.js', 'r', 'utf-8') as f:
    source = f.read()

script = session.create_script( source)

def on_message(message, data):
    if message['type'] == 'error':
	    print(message['stack'])
    else:
        print(message)
    
script.on('message', on_message)
script.load()
sys.stdin.read()
