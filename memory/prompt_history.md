# Prompt History

Auto-appended by `~/.claude/hooks/append-prompt-history.sh` on every UserPromptSubmit.
Scoped to this project directory (`/home/radgh/claude/converter`). Edit freely — new entries append to the bottom.

## 2026-04-23 23:11

We are in a new directory where I'd like to build an offline file converter app. See ./BUILD_PLAN.md for direction.

For the web server, use a local server for now. I will connect to GitHub Pages later.

Info about the server based on another site we already have set up (do NOT use the wp directory, it is another project):

 The wp/ site is served by the system Apache2 (/usr/sbin/apache2), not a per-project server. The relevant
  vhost is:

  - File: /etc/apache2/sites-enabled/wp-plugins.conf
  - Listens: *:8080
  - ServerName: wp.vm
  - DocumentRoot: /home/radgh/claude/wp/wordpress

  Port 80 is already taken by a second vhost pointing at guildmark/GuildMark. Apache is also bound to 443 via
  ports.conf.

  Adding ../converter/ without interfering

  You have two clean, non-interfering options. Both leave the WP vhost untouched.

  Option A — separate port (simplest, no hosts-file edits):

  Create /etc/apache2/sites-available/converter.conf:

  Listen 8081
  <VirtualHost *:8081>
      ServerName converter.vm
      DocumentRoot /home/radgh/claude/converter

      <Directory /home/radgh/claude/converter>
          Options FollowSymLinks
          AllowOverride All
          Require all granted
      </Directory>

      ErrorLog ${APACHE_LOG_DIR}/converter-error.log
      CustomLog ${APACHE_LOG_DIR}/converter-access.log combined
  </VirtualHost>

  Then:
  sudo a2ensite converter.conf
  sudo apache2ctl configtest && sudo systemctl reload apache2

  Access at http://localhost:8081/.

## 2026-04-23 23:15

For scope: Don't worry about that. Use sub agents and repeat the work until completed.

1. Can deviate from plan to match existing systems, the MD file is just a reference. Prefer to match the same tools used in ../game13 and ../wp
2. Use what we already have, I like apache. IDK about pnpm build tools so maybe do npm or something idk you decide. Keep it simple. But if pnpm is faster or beneficial, go ahead.

## 2026-04-23 23:54

Yes please start dev server and update each phase so I can test. You are in a VM and I have to connect via local IP so send me 192.168. links instead of localhost

## 2026-04-24 00:54

Let's hide .queue-controls unless you have more than 1 item in the queue. Once it shows, keep it visible. Move the "Drop images here" section above Default Settings box and keep the results box 2nd. Add credits "By Radley Sustaire" link to https://radleysustaire.com/ and leave Github link. Remove About link.  Hide the keyboard shortcuts button. 

Fix if I drag and drop an image onto the "Drop images here" section it adds twice.

Why is there a dropdown to show format/quality after uploading an image? It doesn't seem to do anything when I change those values. Can we just remove it to keep this super clean? I would also like to show the % saved in a more prominent bubble. Can we also have a "Compare" button next to "Download" which drops down like the currently menu and lets you compare before/after photo for quality?

