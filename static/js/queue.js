import * as HTTP from './http.js'
import * as Helpers from './helpers.js'
import * as DOM from './dom.js'
import * as Table from './table.js'
import * as Chart from './chart.js'
import * as Auth from './auth.js'
import { UrlDataSource, DataSource } from './datasource.js'

const search = new URLSearchParams(window.location.hash.substring(1))
const queue = search.get('name')
const vhost = search.get('vhost')
const pauseQueueForm = document.querySelector('#pauseQueue')
const resumeQueueForm = document.querySelector('#resumeQueue')
document.title = queue + ' | LavinMQ'
let consumerListLength = 20

class ConsumersDataSource extends DataSource {
  constructor () { super({ autoReloadTimeout: 0, useQueryState: false }) }
  setConsumers (consumers) { this.items = consumers }
  reload () { }
}
const consumersDataSource = new ConsumersDataSource()
const consumersTableOpts = {
  keyColumns: ['consumer_tag', 'channel_details'],
  countId: 'consumer-count',
  dataSource: consumersDataSource
}
Table.renderTable('table', consumersTableOpts, function (tr, item) {
  const channelLink = document.createElement('a')
  channelLink.href = HTTP.url`channel#name=${item.channel_details.name}`
  channelLink.textContent = item.channel_details.name
  const ack = item.ack_required ? '●' : '○'
  const exclusive = item.exclusive ? '●' : '○'
  const cancelForm = document.createElement('form')
  const btn = DOM.button.delete({ text: 'Cancel', type: 'submit' })
  cancelForm.appendChild(btn)
  const conn = item.channel_details.connection_name
  const ch = item.channel_details.number
  const actionPath = HTTP.url`api/consumers/${vhost}/${conn}/${ch}/${item.consumer_tag}`
  cancelForm.addEventListener('submit', function (evt) {
    evt.preventDefault()
    if (!window.confirm('Are you sure?')) return false
    HTTP.request('DELETE', actionPath)
      .then(() => {
        DOM.toast('Consumer cancelled')
        updateQueue(false)
      })
  })
  Table.renderCell(tr, 0, channelLink)
  Table.renderCell(tr, 1, item.consumer_tag)
  Table.renderCell(tr, 2, ack, 'center')
  Table.renderCell(tr, 3, exclusive, 'center')
  Table.renderCell(tr, 4, item.prefetch_count, 'right')
  Table.renderCell(tr, 5, cancelForm, 'right')
})

const loadMoreConsumersBtn = document.getElementById('load-more-consumers')
loadMoreConsumersBtn.addEventListener('click', (e) => {
  consumerListLength += 10
  updateQueue(true)
})

function handleQueueState (state) {
  document.getElementById('q-state').textContent = state
  switch (state) {
    case 'paused':
      pauseQueueForm.classList.add('hide')
      resumeQueueForm.classList.remove('hide')
      break
    case 'running':
      pauseQueueForm.classList.remove('hide')
      resumeQueueForm.classList.add('hide')
      break
    default:
      pauseQueueForm.disabled = true
      resumeQueueForm.disabled = true
  }
}

const chart = Chart.render('chart', 'msgs/s')
const queueUrl = HTTP.url`api/queues/${vhost}/${queue}`
function updateQueue (all) {
  HTTP.request('GET', queueUrl + '?consumer_list_length=' + consumerListLength)
    .then(item => {
      Chart.update(chart, item.message_stats)
      handleQueueState(item.state)
      document.getElementById('q-messages-unacknowledged').textContent = item.messages_unacknowledged
      document.getElementById('q-message-bytes-unacknowledged').textContent = Helpers.nFormatter(item.message_bytes_unacknowledged) + 'B'
      document.getElementById('q-unacked-avg-bytes').textContent = Helpers.nFormatter(item.unacked_avg_bytes) + 'B'
      document.getElementById('q-total').textContent = Helpers.formatNumber(item.messages)
      document.getElementById('q-total-bytes').textContent = Helpers.nFormatter(item.total_bytes) + 'B'
      const totalAvgBytes = item.messages !== 0 ? (item.message_bytes_unacknowledged + item.message_bytes_ready) / item.messages : 0
      document.getElementById('q-total-avg-bytes').textContent = Helpers.nFormatter(totalAvgBytes) + 'B'
      document.getElementById('q-messages-ready').textContent = Helpers.formatNumber(item.ready)
      document.getElementById('q-message-bytes-ready').textContent = Helpers.nFormatter(item.ready_bytes) + 'B'
      document.getElementById('q-ready-avg-bytes').textContent = Helpers.nFormatter(item.ready_avg_bytes) + 'B'
      document.getElementById('q-consumers').textContent = Helpers.formatNumber(item.consumers)
      document.getElementById('unacked-link').href = HTTP.url`/unacked#name=${queue}&vhost=${item.vhost}`
      item.consumer_details.filtered_count = item.consumers
      consumersDataSource.setConsumers(item.consumer_details)
      const hasMoreConsumers = item.consumer_details.length < item.consumers
      loadMoreConsumersBtn.classList.toggle('visible', hasMoreConsumers)
      if (hasMoreConsumers) {
        loadMoreConsumersBtn.textContent = `Showing ${item.consumer_details.length} of total ${item.consumers} consumers, click to load more`
      }
      if (all) {
        let features = ''
        features += item.durable ? ' <span title="Durable">D</span>' : ''
        features += item.auto_delete ? ' <span title="Auto delete">AD</span>' : ''
        features += item.exclusive ? ' <span title="Exclusive">E</span>' : ''
        document.getElementById('q-features').innerHTML = features
        document.querySelector('#pagename-label').textContent = queue + ' in virtual host ' + item.vhost
        document.querySelector('.queue').textContent = queue
        if (item.policy) {
          const policyLink = document.createElement('a')
          policyLink.href = HTTP.url`policies#name=${item.policy}&vhost=${item.vhost}`
          policyLink.textContent = item.policy
          document.getElementById('q-policy').appendChild(policyLink)
        }
        if (item.operator_policy) {
          const policyLink = document.createElement('a')
          policyLink.href = HTTP.url`operator-policies#name=${item.operator_policy}&vhost=${item.vhost}`
          policyLink.textContent = item.operator_policy
          document.getElementById('q-operator-policy').appendChild(policyLink)
        }
        if (item.effective_policy_definition) {
          document.getElementById('q-effective-policy-definition').textContent = DOM.jsonToText(item.effective_policy_definition)
        }
        const qArgs = document.getElementById('q-arguments')
        for (const arg in item.arguments) {
          const div = document.createElement('div')
          div.textContent = `${arg}: ${item.arguments[arg]}`
          if (item.effective_arguments.includes(arg)) {
            div.classList.add('active-argument')
            div.title = 'Active argument'
          } else {
            div.classList.add('inactive-argument')
            div.title = 'Passive argument'
          }
          qArgs.appendChild(div)
        }
      }
    })
}
updateQueue(true)
setInterval(updateQueue, 5000)

const tableOptions = {
  dataSource: new UrlDataSource(queueUrl + '/bindings', { useQueryState: false }),
  keyColumns: ['source', 'properties_key'],
  countId: 'bindings-count'
}
const bindingsTable = Table.renderTable('bindings-table', tableOptions, function (tr, item, all) {
  if (!all) return
  if (item.source === '') {
    const td = Table.renderCell(tr, 0, '(Default exchange binding)')
    td.setAttribute('colspan', 4)
  } else {
    const btn = DOM.button.delete({
      text: 'Unbind',
      click: function () {
        const url = HTTP.url`api/bindings/${vhost}/e/${item.source}/q/${queue}/${item.properties_key}`
        HTTP.request('DELETE', url).then(() => { tr.parentNode.removeChild(tr) })
      }
    })

    const exchangeLink = document.createElement('a')
    exchangeLink.href = HTTP.url`exchange#vhost=${vhost}&name=${item.source}`
    exchangeLink.textContent = item.source
    Table.renderCell(tr, 0, exchangeLink)
    Table.renderCell(tr, 1, item.routing_key)
    const pre = document.createElement('pre')
    pre.textContent = JSON.stringify(item.arguments || {})
    Table.renderCell(tr, 2, pre)
    Table.renderCell(tr, 3, btn, 'right')
  }
})

document.querySelector('#addBinding').addEventListener('submit', function (evt) {
  evt.preventDefault()
  const data = new window.FormData(this)
  const e = data.get('source').trim()
  const url = HTTP.url`api/bindings/${vhost}/e/${e}/q/${queue}`
  const args = DOM.parseJSON(data.get('arguments'))
  const body = {
    routing_key: data.get('routing_key').trim(),
    arguments: args
  }
  HTTP.request('POST', url, { body })
    .then(() => {
      bindingsTable.reload()
      evt.target.reset()
      DOM.toast('Exchange ' + e + ' bound to queue')
    })
})

document.querySelector('#publishMessage').addEventListener('submit', function (evt) {
  evt.preventDefault()
  const data = new window.FormData(this)
  const url = HTTP.url`api/exchanges/${vhost}/amq.default/publish`
  const properties = DOM.parseJSON(data.get('properties'))
  properties.delivery_mode = parseInt(data.get('delivery_mode'))
  properties.headers = { ...properties.headers, ...DOM.parseJSON(data.get('headers')) }
  const body = {
    payload: data.get('payload'),
    payload_encoding: data.get('payload_encoding'),
    routing_key: queue,
    properties
  }
  HTTP.request('POST', url, { body })
    .then(() => {
      DOM.toast('Published message to ' + queue)
      updateQueue(false)
    })
})

document.querySelector('#getMessages').addEventListener('submit', function (evt) {
  evt.preventDefault()
  const data = new window.FormData(this)
  const url = HTTP.url`api/queues/${vhost}/${queue}/get`
  const body = {
    count: parseInt(data.get('messages')),
    ack_mode: data.get('mode'),
    encoding: data.get('encoding'),
    truncate: 50000
  }
  HTTP.request('POST', url, { body })
    .then(messages => {
      if (messages.length === 0) {
        window.alert('No messages in queue')
        return
      }
      updateQueue(false)
      const messagesContainer = document.getElementById('messages')
      messagesContainer.textContent = ''
      const template = document.getElementById('message-template')
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i]
        const msgNode = template.cloneNode(true)
        msgNode.removeAttribute('id')
        msgNode.querySelector('.message-number').textContent = i + 1
        msgNode.querySelector('.messages-remaining').textContent = message.message_count
        const exchange = message.exchange === '' ? '(AMQP default)' : message.exchange
        msgNode.querySelector('.message-exchange').textContent = exchange
        msgNode.querySelector('.message-routing-key').textContent = message.routing_key
        msgNode.querySelector('.message-redelivered').textContent = message.redelivered
        msgNode.querySelector('.message-properties').textContent = JSON.stringify(message.properties)
        msgNode.querySelector('.message-size').textContent = message.payload_bytes
        msgNode.querySelector('.message-encoding').textContent = message.payload_encoding
        msgNode.querySelector('.message-payload').textContent = message.payload
        msgNode.classList.remove('hide')
        messagesContainer.appendChild(msgNode)
      }
    })
})

document.querySelector('#moveMessages').addEventListener('submit', function (evt) {
  evt.preventDefault()
  const username = Auth.getUsername()
  const password = Auth.getPassword()
  const uri = HTTP.url`amqp://${username}:${password}@localhost/${vhost}`
  const dest = document.querySelector('[name=shovel-destination]').value.trim()
  const name = 'Move ' + queue + ' to ' + dest
  const url = HTTP.url`api/parameters/shovel/${vhost}/${name}`
  const body = {
    name,
    value: {
      'src-uri': uri,
      'src-queue': queue,
      'dest-uri': uri,
      'dest-queue': dest,
      'src-prefetch-count': 1000,
      'ack-mode': 'on-confirm',
      'src-delete-after': 'queue-length'
    }
  }
  HTTP.request('PUT', url, { body })
    .then(() => {
      evt.target.reset()
      DOM.toast('Moving messages to ' + dest)
    })
})

document.querySelector('#purgeQueue').addEventListener('submit', function (evt) {
  evt.preventDefault()
  let params = ''
  const countElem = evt.target.querySelector("input[name='count']")
  if (countElem && countElem.value) {
    params = `?count=${countElem.value}`
  }
  const url = HTTP.url`api/queues/${vhost}/${queue}/contents${HTTP.noencode(params)}`
  if (window.confirm('Are you sure? Messages cannot be recovered after purging.')) {
    HTTP.request('DELETE', url)
      .then(() => { DOM.toast('Queue purged!') })
  }
})

document.querySelector('#deleteQueue').addEventListener('submit', function (evt) {
  evt.preventDefault()
  const url = HTTP.url`api/queues/${vhost}/${queue}`
  if (window.confirm('Are you sure? The queue is going to be deleted. Messages cannot be recovered after deletion.')) {
    HTTP.request('DELETE', url)
      .then(() => { window.location = 'queues' })
  }
})

pauseQueueForm.addEventListener('submit', function (evt) {
  evt.preventDefault()
  const url = HTTP.url`api/queues/${vhost}/${queue}/pause`
  if (window.confirm('Are you sure? This will suspend deliveries to all consumers.')) {
    HTTP.request('PUT', url)
      .then(() => {
        DOM.toast('Queue paused!')
        handleQueueState('paused')
      })
  }
})

resumeQueueForm.addEventListener('submit', function (evt) {
  evt.preventDefault()
  const url = HTTP.url`api/queues/${vhost}/${queue}/resume`
  if (window.confirm('Are you sure? This will resume deliveries to all consumers.')) {
    HTTP.request('PUT', url)
      .then(() => {
        DOM.toast('Queue resumed!')
        handleQueueState('running')
      })
  }
})

Helpers.autoCompleteDatalist('exchange-list', 'exchanges', vhost)
Helpers.autoCompleteDatalist('queue-list', 'queues', vhost)

document.querySelector('#dataTags').onclick = e => {
  Helpers.argumentHelperJSON('publishMessage', 'properties', e)
}
