require('dotenv').config()
const axios = require('axios')
const lunr = require('lunr')
const cacheAdapterEnhancer = require('axios-extensions').cacheAdapterEnhancer
const Discord = require('discord.js')
const Embed = Discord.RichEmbed

const bot = new Discord.Client()

const http = axios.create({
  baseUrl: '',
  headers: { 'Cache-Control': 'no-cache' },
  adapter: cacheAdapterEnhancer(axios.defaults.adapter)
})

const islandCmd = new Set()

let islandMapper = island => {
  return {
    id: island.id,
    properties: island.properties,
    "properties_nickName": island.properties.nickName,
    "properties_name": island.properties.name
  }
}

async function asyncForEach(array, callback) {
  for (let i = 0; i < array.length; i++)
    await callback(array[i], i, array)
}

// initial request
http.get(`${process.env.API_URL}/api/islands.json`).then(res => {
  console.log('First request done')
  // let idx = lunr(function() {
  //   this.ref('id')
  //   this.field('properties_nickName')
  //   this.field('properties_name')

  //   res.data.features.map(islandMapper).forEach(island => {
  //     this.add(island)
  //   })
  // })

  // console.log(idx.search('+Old~2 +Alexndria~4'))
})

bot.on('ready', () => {
  const msg = `Logged in as: ${bot.user.username}`
  console.log(`${msg}\nID: ${bot.user.id}`)
  console.log('-'.repeat(msg.length))
  bot.user.setPresence({ game: { name: 'the map! | ?island', type: 'WATCHING' }, status: 'online' })

  bot.prefix = '?'

  setInterval(() => {
    bot.user.setPresence({ game: { name: 'the map! | ?island', type: 'WATCHING' }, status: 'online' })
  }, 86400000)
})

bot.on('error', err => {
  console.error(err.message)
})

bot.on('message', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith(bot.prefix)) return;
  const args = msg.content.slice(bot.prefix.length).trim().split(/\s+/g)
  const cmd = args.shift().toLowerCase()
  switch (cmd) {
    case 'island': {
      if (islandCmd.has(msg.author.id)) {
        if (!msg.author.dmChannel) await msg.author.createDM()
        msg.author.dmChannel.send('You must wait to use that command!')
        return msg.delete()
      }
      if (args.length < 1) {
        if (!msg.author.dmChannel) await msg.author.createDM()
        const embed = new Embed()
        embed.setTitle(`${bot.prefix}island command`)
          .setColor('#8c0000')
          .addField('Usage', `${bot.prefix}island <name|id>`)
          .addField('Description', 'Shows information about an island. It will offer suggestions if you get the name slightly wrong.')
        return msg.author.dmChannel.send(embed)
      }
      const request = await http.get(`${process.env.API_URL}/api/islands.json`)
      const islandData = request.data.features
      let island = null
      islandID = args.join(' ')
      if (isNaN(parseInt(islandID))) {
        island = islandData.find(island => island.properties.nickName === islandID)
        if (!island) island = islandData.find(island => island.properties.name === islandID)
      }
      else {
        island = islandData.find(island => island.id === parseInt(islandID))
      }
      if (!island) {
        let idx = lunr(function() {
          this.ref('id')
          this.field('properties_nickName')
          this.field('properties_name')
          islandData.map(islandMapper).forEach(island => {
            this.add(island)
          })
        })
        let search = ''
        args.forEach(a => {
          search += `+${a}~${parseInt(a.length/3)}`
        })

        const results = idx.search(search)
        if (results.length === 0) {
          if (!msg.author.dmChannel) await msg.author.createDM()
          msg.author.dmChannel.send('No results!')
          return msg.channel.type === 'dm' ? null : msg.delete()
        }
        else if (results.length > 8) {
          if (!msg.author.dmChannel) await msg.author.createDM()
          msg.author.dmChannel.send('Too many search results!')
          return msg.channel.type === 'dm' ? null : msg.delete()
        }
        else if (results.length !== 1) {
          msg.react('\u23F3')
          const searchEmbed = new Embed().setTitle('Did you mean...')
          let description = 'React with or type the letter of the island you meant to type!\n\n'
          let letters = []
          let emojis = []
          results.forEach((r, i) => {
            const isl = islandData.find(island => String(island.id) === r.ref)
            description += `:regional_indicator_${String.fromCharCode(97+i)}: ${isl.properties.nickName || isl.properties.name}\n`
            emojis.push(`${String.fromCharCode(55356)}${String.fromCharCode(56806 + i)}`)
            letters.push(String.fromCharCode(97+i))
          })
          searchEmbed.setDescription(description)
          if (!msg.author.dmChannel) await msg.author.createDM()
          const m = await msg.author.dmChannel.send(searchEmbed)
          const reactFilter = (reaction, user) => user.id === msg.author.id && emojis.includes(reaction.emoji.name)
          const msgFilter = am => am.author.id === msg.author.id
          let choice = null
          asyncForEach(emojis, async e => {
            if (!choice)
              await m.react(e)
          })
          let aReacts = m.awaitReactions(reactFilter, { max: 1, time: 30000 })
          let aMsgs = m.channel.awaitMessages(msgFilter, { max: 1, time: 30000})
          choice = await Promise.race([aReacts, aMsgs])
          if (choice.size === 0) {
            m.delete()
            if (!msg.author.dmChannel) await msg.author.createDM()
            msg.author.dmChannel.send('You did not make a selection!')
            return msg.channel.type === 'dm' ? null : msg.delete()
          }
          else {
            if (choice.first().content)
              island = islandData.find(island => String(island.id) === results[letters.indexOf(choice.first().content.toLowerCase())].ref)
            else
              island = islandData.find(island => String(island.id) === results[emojis.indexOf(choice.first().emoji.name)].ref)
          }
        }
        else
          island = islandData.find(island => String(island.id) === results[0].ref)
      }
      const islandEmbed = new Embed()
      islandEmbed.setTitle(island.properties.nickName || island.properties.name)
        .setURL(island.properties.workshopUrl || null)
        .setImage(island.properties.imagePopup)
        .setThumbnail('https://map.cardinalguild.com/_nuxt/img/cd4d6e4.png')
        .setAuthor(island.properties.creator, null, island.properties.creatorWorkshopUrl || null)
        .addField('Tier', island.properties.tier, true)
        .addField('Altitude', island.properties.altitude, true)
        .addField('Culture', island.properties.type.slice(0, 1).toUpperCase() + island.properties.type.slice(1), true)
        .addField('Databanks', island.properties.databanks, true)
        .addField('Revival Chambers', `\`\`\`${island.properties.revivalChambers ? 'css\nYes' : 'diff\n- No'}\`\`\``, true)
        .addField('Turrets', `\`\`\`${island.properties.turrets ? 'diff\n- Yes' : 'css\nNo'}\`\`\``, true)
        .addField('Survey by', `${island.properties.surveyCreatedBy} @ ${island.properties.createdAt}`, true)
      switch (island.properties.tier) {
        case 1: {
          islandEmbed.setColor('#b1deab')
          break
        }
        case 2: {
          islandEmbed.setColor('#aecbf5')
          break
        }
        case 3: {
          islandEmbed.setColor('#e3c9f9')
          break
        }
        case 4: {
          islandEmbed.setColor('#f7c38f')
          break
        }
        default: {
          islandEmbed.setColor('RED')
        }
      }
      msg.clearReactions().then(() => {
        msg.react('\u2705')
      })
      msg.channel.send(islandEmbed)
      islandCmd.add(msg.author.id)
      setTimeout(() => {
        islandCmd.delete(msg.author.id)
      }, 10000)
    }
  }
})

bot.login(process.env.TOKEN)
