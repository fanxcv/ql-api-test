const {app, BrowserWindow, session, dialog} = require('electron')
const Store = require('electron-store')
const config = require('./config')
const axios = require('axios')

const keys = ["pt_pin", "pt_key"]
const store = new Store();
const key = 'tokenKey'
let isFirst = true
let win

function createWindow() {
  win = new BrowserWindow({
    width: 450,
    height: 800
  })
  const content = win.webContents
  content.on('did-finish-load', () => {
    findValue()
  })

  win.on('ready-to-show', () => {
    isFirst && showNotice("正常登录京东即可, 登录完之后稍等一小会儿, 会出现一个提示框告诉你成功与否, 耐心等等哟")
      .then(() => {
        console.log("用户晓得了")
        isFirst = false
      })
  })

  win.loadURL('https://bean.m.jd.com/bean/signIndex.action')
  // win.webContents.openDevTools()
}

function findValue() {
  let values = {}
  let timer = setInterval(async () => {
    await session.defaultSession.cookies.get({url: 'https://bean.m.jd.com'})
      .then(function (cookies, error) {
        if (!cookies) {
          console.error("未获取到cookie", error)
        }

        for (let cookie of cookies) {
          if (keys.indexOf(cookie.name) !== -1) {
            values[cookie.name] = cookie.value
          }
        }
      });

    if (Object.keys(values).length === 2) {
      clearInterval(timer)

      let v = ""
      for (let key of keys) {
        v += `${key}=${values[key]};`
      }

      // 发送给青
      let success = true
      try {
        const token = await getToken()
        if (!token) {
          showNotice('登录失败, 获取服务器信息错误, 软件即将关闭')
            .then(() => app.exit())
        }
        const ckList = await getCkList(token) || []
        const pin = values['pt_pin']
        const cks = ckList.filter(it => it.value.indexOf(`pt_pin=${pin};`) >= 0)
        if (cks && cks.length > 0) {
          for (let ck of cks) {
            success = success && await updateCk(token, ck, v)
          }
        } else {
          success = await addCk(token, v, pin)
        }
      } catch (e) {
        success = false
      }

      showNotice(success ? '登录成功了, 即将返回登录界面, 你就可以登录其他的账号了' : '登录失败了, 要不再试一次吧')
        .then(() => {
          const map = keys.map(it => session.defaultSession.cookies.remove('https://bean.m.jd.com', it));
          Promise.all(map).then(res => console.log("移除成功了", res))
          win.loadURL('https://bean.m.jd.com/bean/signIndex.action')
        })
    }
  }, 1000)
}

function showNotice(message) {
  return dialog.showMessageBox(win, {
    buttons: ["我晓得鸟"],
    title: "你有个小提示哟",
    message
  })
}

async function getToken() {
  const token = store.get(key);
  if (token && (token.expiration - 300) * 1000 >= new Date().getTime()) {
    return token.token
  }

  const {data: {code, data}} = await axios.get(`${config.Host}/open/auth/token?client_id=${config.clientId}&client_secret=${config.clientSecret}`)
  if (code === 200) {
    store.set(key, data)
    return data.token
  }
}

async function getCkList(token) {
  const {data: {code, data}} = await axios.get(`${config.Host}/open/envs?searchValue=&t=${new Date().getTime()}`, {
    headers: {Authorization: `Bearer ${token}`}
  })
  if (code === 200) {
    return data
  }
}

async function updateCk(token, ck, value) {
  const {name, remarks, id} = ck
  const {data: {code}} = await axios.put(`${config.Host}/open/envs?t=${new Date().getTime()}`, {
    name, remarks, id, value
  }, {
    headers: {Authorization: `Bearer ${token}`}
  }).then(() => axios.put(`${config.Host}/open/envs/enable?t=${new Date().getTime()}`, [id], {
    headers: {Authorization: `Bearer ${token}`}
  }))
  return code && code === 200
}

async function addCk(token, value, pin) {
  const {data: {code}} = await axios.post(`${config.Host}/open/envs?t=${new Date().getTime()}`, [{
    name: 'JD_COOKIE', remarks: pin, value
  }], {
    headers: {Authorization: `Bearer ${token}`}
  })
  return code && code === 200
}

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', app.exit)
