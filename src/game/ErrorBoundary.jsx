import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', background: '#1a2332', minHeight: '100vh', color: '#e0e0e0' }}>
          <h2>页面出错</h2>
          <pre style={{ marginTop: 16, fontSize: 13, color: '#f44' }}>
            {this.state.error?.message || '未知错误'}
          </pre>
          <button
            style={{ marginTop: 24, padding: '8px 24px', cursor: 'pointer' }}
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
          >
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
