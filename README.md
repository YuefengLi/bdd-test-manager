
# About
This is a BDD test manager to enumerate and manage BDD test cases.

# Build
Recommend to use `nvm` or `volta`(for windows) to install and manage node.js.

Run `npm install` in `./frontend` and `./backend`
Run `npm start` in `./backend`
Run `npm start` in `./frontend` to debug in local

# Deploy
```bash
cd ./frontend
REACT_APP_API_BASE=http://your-backend.example.com:3000 npm run build

# if necessary
npm install -g serve`

serve -l 8080 -s build
```

# Data
datbase file at `./backend/data.db`.

# Known Issues

# TODOs
