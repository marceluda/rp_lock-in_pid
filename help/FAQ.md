---
title: FAQ
description: Frequently Asked Questions
layout: page
h3tolinkdiv: true
---



# Troubleshooting

### The RedPitaya host has not internet access and the App takes to long to start
<div class="collapse" markdown="1" style="padding: 10px; border: 1px solid gray; border-radius: 5px;">

In some versions of the RedPitaya ecosystem (the software related to the load and manage of
applications) the web server tries to look after updates on internet before loading any application.
If there's no internet access the loading process can take several minutes. This happens all the times
you try to load and application, even if you close the browser tab by mistake and try to reopen it.

Some times this feature even hangs up your App if you push "Back" button in the browser.

To fix it, you have to disable the update check inside the Red Pitaya Operative System.

  1. Log in into your Red Pitaya device using SSH (use `ssh` command on linux or PuTTY on windows)
  2. Turn on the write permission with `rw` command.
  3. Edit the file: '/opt/redpitaya/www/apps/updater/list.sh'
  4. Comment out the 'wget' line by adding a '#' character at the beginning of the line.

You can use any editor to do this, like `vim` or `nano`. Also, you can edit it with one commnad line:

```bash
rw  # this command is to turn on the write permission on RP
sed ' s/^wget /#wget/ ' -i /opt/redpitaya/www/apps/updater/list.sh
```
That's all.

Before editing the file, its head looks like:
```bash
#!/bin/bash
wget -O /tmp/download.html http://downloads.redpitaya.com/downloads/0.96 &> /dev/null
```

After edit:
```bash
#!/bin/bash
#wget -O /tmp/download.html http://downloads.redpitaya.com/downloads/0.96 &> /dev/null
```

</div>

### How do I restart the Red Pitaya web server without restarting the whole system?
<div class="collapse" markdown="1" style="padding: 10px; border: 1px solid gray; border-radius: 5px;">

If you need to restart the Red Pitaya web server you just need to restart the `nginx` service.

  1. Log in into your Red Pitaya device using SSH (use `ssh` command on linux or PuTTY on windows)
  2. Run these commands:

```bash
systemctl stop redpitaya_nginx

systemctl start redpitaya_nginx
```

</div>

### Where do I found the App logs for troubleshooting/Debugging?
<div class="collapse" markdown="1" style="padding: 10px; border: 1px solid gray; border-radius: 5px;">

Inside Red Pitaya Operativ System, the log files are stored in the folder:

`/var/log/redpitaya_nginx/`

You should look inside `error.log` and `debug.log` files.

There's an `nginx` bug that logs and error constantly in some applications, that says:
`the http output chain is empty`.
If you need to get rid off this messages you can erase them by this two commnads:

```bash
rw  # this command is to turn on the write permission on RP

sed '/output chain is empty/d' -i /var/log/redpitaya_nginx/error.log
sed '/output chain is empty/d' -i /var/log/redpitaya_nginx/debug.log
```

</div>
