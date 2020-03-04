const _ = require(`lodash`)
const Promise = require(`bluebird`)
const unified = require(`unified`)
const Rehype = require(`rehype`)
const Remark = require(`remark`)
var stringify = require('rehype-stringify')

module.exports = (
  {
    type,
    basePath,
    getNode,
    getNodesByType,
    reporter,
    ...rest
  },
  pluginOptions
) => {
  const nodeType = pluginOptions.type || `HtmlRehype`

  if (type.name !== nodeType) {
    return {}
  }

  console.log(type.name)

  return new Promise((resolve, reject) => {
    // Setup rehype.
    let rehype = new Rehype() //.data(`settings`, htmlOptions)
    let remark = new Remark()

    for (let plugin of pluginOptions.plugins) {
      const requiredPlugin = require(plugin.resolve)
      if (_.isFunction(requiredPlugin.setParserPlugins)) {
        for (let parserPlugin of requiredPlugin.setParserPlugins(
          plugin.pluginOptions
        )) {
          if (_.isArray(parserPlugin)) {
            const [parser, options] = parserPlugin
            rehype = rehype.use(parser, options)
          } else {
            rehype = rehype.use(parserPlugin)
          }
        }
      }
    }

    async function getAST(htmlNode) {
        // Use Bluebird's Promise function "each" to run rehype plugins serially.
        await Promise.each(pluginOptions.plugins, plugin => {
          const requiredPlugin = require(plugin.resolve)
          if (_.isFunction(requiredPlugin.mutateSource)) {
            return requiredPlugin.mutateSource(
              {
                htmlNode,
                getNode,
                reporter,
                compiler: {
                  parseString: rehype.parse.bind(rehype),
                  generateHTML: null,
                },
                ...rest,
              },
              plugin.pluginOptions
            )
          } else {
            return Promise.resolve()
          }
        })
        const htmlAST = rehype.parse(htmlNode.content)

        await Promise.each(pluginOptions.plugins, plugin => {
          const requiredPlugin = require(plugin.resolve)
          // Allow both exports = function(), and exports.default = function()
          const defaultFunction = _.isFunction(requiredPlugin)
            ? requiredPlugin
            : _.isFunction(requiredPlugin.default)
            ? requiredPlugin.default
            : undefined

          if (defaultFunction) {
            return defaultFunction(
              {
                htmlAST,
                htmlNode,
                getNode,
                basePath,
                reporter,
                compiler: {
                  parseString: rehype.parse.bind(rehype),
                  generateHTML: null,
                },
                ...rest,
              },
              plugin.pluginOptions
            )
          } else {
            return Promise.resolve()
          }
        })
        return htmlAST
    }

    async function gethtmlAST(htmlNode) {
        const htmlAST = await getAST(htmlNode)
        return htmlAST
    }

    async function getHTML(htmlNode) {
        const htmlAST = await getAST(htmlNode)
        return unified()
            .use(stringify)
            .stringify(htmlAST)
    }

    return resolve({
      html: {
        type: `String`,
        resolve(htmlNode) {
            return getHTML(htmlNode)
        },
      },
      htmlAST: {
        type: `JSON`,
        resolve(htmlNode) {
            return gethtmlAST(htmlNode).then(ast => {
                return ast
            })
        },
      },
      htmlSource: {
        type: `String`,
        resolve(htmlNode) {
            return htmlNode.content
        },
      },
    })
  })
}
