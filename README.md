
```
██████╗ ███████╗███████╗███████╗████████╗ 
██╔══██╗██╔════╝██╔════╝██╔════╝╚══██╔══╝ 
██████╔╝█████╗  █████╗  ███████╗   ██║    
██╔══██╗██╔══╝  ██╔══╝  ╚════██║   ██║    
██████╔╝███████╗███████╗███████║   ██║    
╚═════╝ ╚══════╝╚══════╝╚══════╝   ╚═╝    
```

**Bees**t **T**oolkit for [Swarm](https://www.ethswarm.org/)

![image](https://github.com/user-attachments/assets/adef6596-79be-4495-bc72-9b2ae3b4e892)
## Requirements

- `node` >= 20
- `node` installed using `nvm`
- any Linux distribution (tested on Ubuntu) 

> [!WARNING] 
> - Install and manage node versions using [nvm](https://github.com/nvm-sh/nvm).
> - Do not install the nodejs apt package! It may require root privileges to install npm modules and lead to security issues!

## 1. Uninstall any existing `nodejs` apt packages

Uninstall Node.js:
```
sudo apt remove nodejs
```

Purge Configuration Files:
```
sudo apt purge nodejs
```

Remove Unused Dependencies (optional):
```
sudo apt autoremove
```

Clean Up Any Residual Configuration Files (optional):
```
sudo apt autoclean
sudo apt clean
```

## 2. Install latest node using nvm

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install --lts
```

```
node -v
v20.xx.x
```

## 3. Run Beest

```
git clone https://github.com/rampall/beest.git
cd beest
npm install
npm start
```

### Run an ultra-light node
![image](https://github.com/user-attachments/assets/a1cef678-0ad2-468f-894e-b4ecb46b53ae)

### Run a light node
![image](https://github.com/user-attachments/assets/663a040d-4327-4107-aced-694aabb306c0)

### Run a full node
![image](https://github.com/user-attachments/assets/14a01cb1-0a35-4e7d-96c7-7cbfe2a21a59)

### Show status of bee nodes
![image](https://github.com/user-attachments/assets/9b851074-b7e7-4a72-9eb2-ee8fbbb73c30)

## 4. Managing Beest processess

BEEST uses [pm2](https://github.com/Unitech/pm2) under the hood to manage all the bee & etherproxy processes under the "beest" namespace. You can use `pm2` and all its supported commands to manage the various processes.

### List all proceses
```
pm2 ls
```

### Show log of a bee node (with `pm_id` = `2`)
```
pm2 logs 2
```

### Stop all proceses
```
pm2 stop beest
```

### Delete all Beest proceses
```
pm2 delete beest
```

### TODO
- [x] mainnet
  - [x] run an bee ultralight node
  - [x] run an bee light node
  - [x] run an bee full node
- [x] show status of all bee nodes
  - [ ] funding wallet status 
- [x] delete all bees
- [x] funding wallet to fund xdai for bee nodes
- [x] pm2 integration
- [x] etherproxy integration
- [x] setup to automatically start upon reboot/restart
- [ ] stake bee node from funding wallet
- [ ] manually upgrade bee nodes 
- [ ] interactive target neighborhood selection
- [x] testnet support
- [ ] non-interactive CI/CD mode
