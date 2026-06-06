pre install NPM     
    sudo apt-get install -y nodejs npm
copy application files to box manually 
    /home/student account
uncompress file .tar
    tar -xvf "student account.tar"
run from install dir 
    sudo bash install-ubuntu.sh
stop application
    sudo systemctl stop moneyfinder
stat application
    sudo systemctl restart moneyfinder




notes:
  - installer auto-patches Google Fonts out of layout.tsx (corporate SSL proxy)
  - DB password is auto-generated and saved to /opt/moneyfinder/.env
  - self-signed cert installed by default — replace via Settings -> SSL
  - service name: moneyfinder  (sudo systemctl status moneyfinder)
  - default login: admin / admin  (forced password change on first login)