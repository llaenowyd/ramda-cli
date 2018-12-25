import React from 'react'
import http from 'stream-http'
import * as R from 'ramda'
import debounce from 'lodash.debounce'
import compileFun from '../lib/compile-fun'
import { parse, help } from '../lib/argv'
import { lines, unlines } from '../lib/utils'
import stringArgv from 'string-argv'
import stringToStream from 'string-to-stream'
import { processInputStream, concatStream } from '../lib/stream'
import Output from './Output'
import Editor from './Editor'
import initDebug from 'debug'

import style from './styles/App.scss'

const debug = initDebug('ramda-cli:App')
const die = (msg) => console.error(msg)

const removeCommentedLines = R.pipe(
  lines,
  R.reject((x) => /^#/.test(x)),
  unlines
)

class App extends React.Component {
  constructor(props) {
    super(props)
    this.onInputChange = this.onInputChange.bind(this)
    this.evalInput = debounce(this.evalInput.bind(this), 400)
    this.onEvalInputError = this.onEvalInputError.bind(this)
    this.setDocumentTitle = this.setDocumentTitle.bind(this)
    this.stdin = ''
    this.state = {
      input: props.input,
      output: [],
      opts: {},
      error: null
    }
    this.stdinHttpReq = http.get('/stdin', (res) => {
      res.on('data', this.onStdinChunk.bind(this))
    })

    window.addEventListener('blur', this.setDocumentTitle, false)
  }

  onStdinChunk(buf) {
    this.stdin += buf.toString()
    this.evalInput()
  }

  componentWillUnmount() {
    this.stdinHttpReq.abort()
    window.removeEventListener('blur', this.setDocumentTitle)
  }

  onInputChange(input) {
    this.setState({ input }, this.evalInput)
  }

  onEvalInputError(err) {
    this.setState({
      output: [],
      error: err
    })
  }

  setDocumentTitle() {
    const { input } = this.state
    document.title = `ramda ${input !== '' ? input : 'identity'}`
  }

  evalInput() {
    const { stdin } = this
    let { input } = this.state
    if (stdin === null) return
    let opts
    input = input.trim()
    const argv = stringArgv(removeCommentedLines(input), 'node', 'dummy.js')
    try {
      opts = parse(argv)
    } catch (err) {
      this.onEvalInputError(err)
      return
    }

    if (opts.help) {
      this.setState({
        output: [help()],
        opts,
        error: null
      })
      return
    }

    let fun
    try {
      fun = compileFun(opts)
    } catch (err) {
      this.onEvalInputError(err)
      return
    }

    const inputStream = stringToStream(stdin)
    const stream = processInputStream(
      this.onEvalInputError,
      opts,
      fun,
      inputStream
    )
    stream.pipe(concatStream()).on('data', (chunk) => {
      this.setState({
        output: chunk,
        opts,
        error: null
      })
    })

    window.fetch('/update-input', {
      method: 'POST',
      body: input
    })
  }

  render() {
    const { output, opts, error } = this.state
    return (
      <div className={style.app}>
        <Editor
          value={this.state.input}
          onChange={(value) => {
            this.onInputChange(value)
          }}
          placeholder="identity"
        />
        {output && (
          <Output
            output={output.join('')}
            outputType={opts.outputType}
            error={error}
          />
        )}
      </div>
    )
  }
}

export default App
