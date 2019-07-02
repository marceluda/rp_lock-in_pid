# -*- coding: utf-8 -*-
"""
Created on Tue Sep 12 10:33:55 2017

@author: lolo
"""




#%% Class definition

import paramiko
import getpass
import socket

import os
from time import sleep
import time
from datetime import datetime

import platform






BLUE='\033[34m'
RED='\033[31m'
NORMAL='\033[0m'

class config_RP:
    """
    This class has a set of rutines for App installation and configuration
    """

    def __init__(self,host,port=22,password='',user='root',key_path=''):
        self.host           = host
        self.port           = port
        self.password       = password if len(password)>0 else 'root'
        self.user           = user
        self.connected      = False
        self.rw             = False
        self.ssh            = paramiko.SSHClient()
        self.path           = os.getcwd()
        self.key_path       = key_path if len(key_path)>0 else 'pass' if len(password)>0 else ''
        self.linux          = True if platform.system()=='Linux' else False
        self.home           = os.environ['HOME'] if platform.system()=='Linux' else os.environ['USERPROFILE']
        self.verbose        = True
        paramiko.util.log_to_file('ssh_session.log')

    def __exit__(self, exc_type, exc_value, traceback):
        self.ssh.close()
        self.active = False
        for i in [exc_type, exc_value, traceback]:
            if not i==None:
                print(repr(i))
        #print('exit')

    def __del__(self):
        self.ssh.close()
        #print('del')

    def __enter__(self):
        return self

    def __repr__(self):
        txt ='config_RP(host="'+self.host+'",'
        txt+=          'port='+str(self.port)+','
        txt+=          'user="'+self.user+'"'
        txt+=')\n'
        return txt

    def resolve_dns(self):
        try:
            addr    = socket.gethostbyname(self.host)
            self.ip = addr
            return True
        except Exception as e:
            return False

    def check_tcp_connection(self):
        with socket.socket() as s:
            try:
                s.connect((self.host, self.port))
                return True
            except Exception as e:
                return False

    def try_local_key(self):
        if not os.path.isfile('key'):
            return False
        key_path = os.path.join(os.getcwd(),'key')
        try:
            self.ssh.connect(hostname=self.host,port=self.port,username=self.user, key_filename=key_path)
            self.key_path = key_path
            return True
        except Exception as e:
            print('could not connect with local key:'+ repr(e) )
            return False

    def try_user_key(self):
        for i in ['id_rsa','id_dsa']:
            key_path = os.path.join(os.environ['HOME'], '.ssh', i)
            if os.path.isfile(key_path):
                try:
                    self.ssh.connect(hostname=self.host,port=self.port,username=self.user, key_filename=key_path)
                    self.key_path = key_path
                    return True
                except Exception as e:
                    print('could not connect with user key('+i+'):'+ repr(e) )
        return False

    def try_pass(self):
        try:
            self.ssh.connect(hostname=self.host,port=self.port,username=self.user,password=self.password)
            self.key_path = 'pass'
            return True
        except Exception as e:
            print('could not connect with password:'+ repr(e))
            return False

    def try_keypath(self):
        try:
            self.ssh.connect(hostname=self.host,port=self.port,username=self.user, key_filename=self.key_path)
        except Exception as e:
            print('could not connect with key('+self.key_path+'):'+ repr(e) )

    def ssh_connect(self):
        # globals()['__file__']
        if self.connected:
            return True
        self.ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.connected = True
        if self.key_path=='' and ( self.try_local_key() or self.try_user_key() or self.try_pass()):
            print('looking for auth method')
            return(True)
        elif self.key_path=='pass' and self.try_pass():
            print('auth method: pass')
            return(True)
        elif os.path.isfile(self.key_path) and self.try_keypath():
            print('auth method: key: '+self.key_path)
            return(True)
        else:
            self.connected = False
            return(False)

    def create_local_key(self):
        if os.path.isfile('key'):
            print('Already exists key file.')
            return False
        try:
            private_key = paramiko.RSAKey.generate(bits=2048)
            private_key.write_private_key_file('key')
            print('key file "key" was created')
        except Exception as e:
            print('could not create key:'+ repr(e) )
            return False

        with open("key.pub", 'w') as f:
            f.write("{:s} {:s}".format(private_key.get_name(), private_key.get_base64()) )
            f.write(" Generated automatically for lock_in+pid app")
            print('public key file "key.pub" was created')
        return True

    def upload_public_key(self):
        if not os.path.isfile('key'):
            print('No local key file found.')
            return False
        private_key = paramiko.RSAKey(filename='key')
        if not self.connected:
            self.ssh_connect()

        self.ssh_cmd('mkdir -p /root/.ssh')
        self.ssh_cmd('touch /root/.ssh/authorized_keys')

        stdout = self.ssh_cmd('cat /root/.ssh/authorized_keys | grep "'+private_key.get_base64()+'"')
        print(BLUE+stdout+NORMAL)
        if len(stdout)>0:
            print('Public key already loaded')
            self.key_path = os.path.join(os.getcwd(),'key')
            return True

        stdout = self.ssh_cmd('echo "'+
                                     private_key.get_name()+' '+
                                     private_key.get_base64()+
                                     '" >> /root/.ssh/authorized_keys' )
        stdout = self.ssh_cmd('cat /root/.ssh/authorized_keys | grep "'+private_key.get_base64()+'"')
        print(BLUE+stdout+NORMAL)
        if len(stdout)>0:
            print('Public key loaded')
            self.ssh_cmd('chmod 600 /root/.ssh/authorized_keys')
            self.ssh_cmd('chmod 700 /root/.ssh')
            self.key_path = os.path.join(os.getcwd(),'key')
            return True
        else:
            print('Public key load FAILED')
            return False

    def ssh_cmd(self,cmd):
        if not self.ssh_connect():
            print('Could not connect trought ssh')
            return False
        if not self.rw:
            self.ssh.exec_command('rw')
        if self.verbose:
            print('Remote Command: '+RED+cmd+NORMAL)
        stdin,stdout,stderr = self.ssh.exec_command(cmd)
        return ''.join(stdout.readlines())

    def ssh_close(self):
        self.ssh.close()
        self.connected = False




if __name__ == '__main__':

    rp = config_RP(host='10.0.32.207',port=22,password='root')

    print( rp.resolve_dns() )

    print( rp.check_tcp_connection() )

    print( rp.ssh_connect() )

    print( BLUE+rp.ssh_cmd('find /root/py')+NORMAL )

    rp.upload_public_key()

    print(rp.ssh_cmd('ls /root/py')    )
