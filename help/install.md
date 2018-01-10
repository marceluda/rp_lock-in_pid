---
title: Download and install
description: Installation in RP
layout: page
---

# Download application

Download last release (beta):

[lock-in+pid-0.1.0-15-devbuild.tar.gz]({{ site.baseurl }}/releases/lock-in+pid-0.1.0-15-devbuild.tar.gz)

[lock-in+pid-0.1.0-15-devbuild.zip]({{ site.baseurl }}/releases/lock-in+pid-0.1.0-15-devbuild.zip)

# Install App in RedPitaya

First, you need an already running RedPitaya enviroment. If you don't know
how to prepare the device SDCard, just follow the
[RedPitaya help page instructions](http://redpitaya.readthedocs.io/en/latest/quickStart/SDcard/SDcard.html)

To install the web application you need to upload the `rp_lock-in_pid` folder
to `/opt/redpitaya/www/apps/`. You can do that with several SSH clients.

## For Windows

Use [PuTTY](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) to
log into the RedPitaya device and run `rw`:

```bash
root@rp-XXXXXX:~$ rw
```

Then, use [WinSCP](https://winscp.net/) to upload the `rp_lock-in_pid` folder to
 `/opt/redpitaya/www/apps/`

If you want to use the remote control tools you need to copy the `rp_lock-in_pid/resources/RP_py/*.py` content to `/root/py` in the RedPitaya device.

### Automatic login for PuTTY

TO BE COMPLETED

## For linux

To enable `rw`, in a Terminal console run:

```bash
ssh rp-XXXXXX.local -l root  "PATH_REDPITAYA=/opt/redpitaya /boot/sbin/rw"
```

where `rp-XXXXXX.local` is the device address.

Then upload the `rp_lock-in_pid` folder.

### With GUI

You can use any SSH file transfer client, like FileZilla of gftp.

### With console
Using the scp command from console:

```bash
scp -r rp_lock-in_pid  root@rp-XXXXXX.local:/opt/redpitaya/www/apps/rp_lock-in_pid
scp -r rp_lock-in_pid/resources/rp_cmds/*  root@rp-XXXXXX.local:/root/
```

### automatic script
The installation package includes a bash script to automatically upload
the application to the RedPitaya device.

Just run:
```bash
bash upload_app.sh rp-XXXXXX.local
```

### Configure automatic login into RP

It's useful to automate the login procedure to get into RedPitaya console without
typing user and password each time. To do this you need to have an SSH key. If you
don't have one, create it with this command in localhost console:

```bash
ssh-keygen
```
If it ask you for Pass Phrase, just hit enter key

Then upload the public key to RP:

```bash
ssh-copy-id -i ~/.ssh/id_rsa.pub rp-XXXXXX.local
```

Now you should be able to login without a password:

```bash
ssh rp-XXXXXX.local -l root
```
