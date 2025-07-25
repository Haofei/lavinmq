import * as HTTP from './http.js'
import * as Table from './table.js'
import * as DOM from './dom.js'

const vhost = new URLSearchParams(window.location.hash.substring(1)).get('name')
document.title = vhost + ' | LavinMQ'
document.querySelector('#pagename-label').textContent = vhost

const vhostUrl = HTTP.url`api/vhosts/${vhost}`
HTTP.request('GET', vhostUrl).then(item => {
  document.getElementById('ready').textContent = item.messages_ready.toLocaleString()
  document.getElementById('unacked').textContent = item.messages_unacknowledged.toLocaleString()
  document.getElementById('total').textContent = item.messages.toLocaleString()
})

function fetchLimits () {
  HTTP.request('GET', HTTP.url`api/vhost-limits/${vhost}`).then(arr => {
    const limits = arr[0] || { value: {} }
    const maxConnections = limits.value['max-connections'] || ''
    document.getElementById('max-connections').textContent = maxConnections.toLocaleString()
    document.forms.setLimits['max-connections'].value = maxConnections
    const maxQueues = limits.value['max-queues'] || ''
    document.getElementById('max-queues').textContent = maxQueues.toLocaleString()
    document.forms.setLimits['max-queues'].value = maxQueues
  })
}
fetchLimits()

const permissionsUrl = HTTP.url`api/vhosts/${vhost}/permissions`
const tableOptions = { url: permissionsUrl, keyColumns: ['user'], countId: 'permissions-count' }
const permissionsTable = Table.renderTable('permissions', tableOptions, (tr, item, all) => {
  Table.renderCell(tr, 1, item.configure)
  Table.renderCell(tr, 2, item.write)
  Table.renderCell(tr, 3, item.read)
  if (all) {
    const btn = DOM.button.delete({
      text: 'Clear',
      click: function () {
        const url = HTTP.url`api/permissions/${vhost}/${item.user}`
        HTTP.request('DELETE', url).then(() => tr.parentNode.removeChild(tr))
      }
    })
    const userLink = document.createElement('a')
    userLink.href = HTTP.url`user#name=${item.user}`
    userLink.textContent = item.user
    Table.renderCell(tr, 0, userLink)
    Table.renderCell(tr, 4, btn, 'right')
  }
})

function addUserOptions (users) {
  const select = document.forms.setPermission.elements.user
  while (select.options.length) select.remove(0)
  for (let i = 0; i < users.length; i++) {
    const opt = document.createElement('option')
    opt.text = users[i].name
    select.add(opt)
  }
}

function fetchUsers (cb) {
  const url = 'api/users'
  const raw = window.sessionStorage.getItem(url)
  if (raw) {
    const users = JSON.parse(raw)
    cb(users)
  }
  HTTP.request('GET', url).then(function (users) {
    try {
      window.sessionStorage.setItem('api/users', JSON.stringify(users))
    } catch (e) {
      console.error('Saving sessionStorage', e)
    }
    cb(users)
  }).catch(function (e) {
    console.error(e.message)
  })
}
fetchUsers(addUserOptions)

document.querySelector('#setPermission').addEventListener('submit', function (evt) {
  evt.preventDefault()
  const data = new window.FormData(this)
  const url = HTTP.url`api/permissions/${vhost}/${data.get('user')}`
  const body = {
    configure: data.get('configure'),
    write: data.get('write'),
    read: data.get('read')
  }
  HTTP.request('PUT', url, { body })
    .then(() => {
      permissionsTable.reload()
      evt.target.reset()
    })
})

document.forms.setLimits.addEventListener('submit', function (evt) {
  evt.preventDefault()
  const maxConnectionsUrl = HTTP.url`api/vhost-limits/${vhost}/max-connections`
  const maxConnectionsBody = { value: Number(this['max-connections'].value || -1) }
  const maxQueuesUrl = HTTP.url`'api/vhost-limits/${vhost}/max-queues`
  const maxQueuesBody = { value: Number(this['max-queues'].value || -1) }
  Promise.all([
    HTTP.request('PUT', maxConnectionsUrl, { body: maxConnectionsBody }),
    HTTP.request('PUT', maxQueuesUrl, { body: maxQueuesBody })
  ]).then(fetchLimits)
})

document.querySelector('#deleteVhost').addEventListener('submit', function (evt) {
  evt.preventDefault()
  const url = HTTP.url`api/vhosts/${vhost}`
  if (window.confirm('Are you sure? This object cannot be recovered after deletion.')) {
    HTTP.request('DELETE', url)
      .then(() => { window.location = 'vhosts' })
  }
})
