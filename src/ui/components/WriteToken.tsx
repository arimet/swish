import { useState } from 'react'
import { checkToken, token, setToken, type State } from '../../persistence/api'
import { useT } from '../../i18n'
import { C, bd } from '../olive/kit'

/**
 * The write token, entered once per device.
 *
 * It is not one of the three access codes: those say *who you are* and live for the
 * length of a tab; this one is a device setting, entered by whoever deployed, and
 * checked by the server.
 *
 * **It appears on the welcome screen as well as under Administration**, and that is
 * not duplication for its own sake. Administration sits behind a chosen club, a club
 * comes from a team, and a team is a write: on a fresh deployment the only door to
 * the application was locked from the inside, and the key was behind it. A device
 * that only ever reads can ignore this block entirely.
 */
export function WriteToken() {
  const translate = useT()
  const [value, setValue] = useState(token)
  // Deliberately `idle` rather than the module's current state: the screens read
  // constantly, and reading is public, so a successful read would have this block
  // announce "the server accepts this device" to someone who has never entered a
  // valid token. Only the probe below may say that.
  const [state, setState] = useState<State>('idle')
  const [trying, setTrying] = useState(false)

  // We save and then really try, rather than announcing "saved" on a token the
  // server will reject: this is the kind of setting you enter once and never come
  // back to check.
  const verify = async () => {
    setToken(value.trim())
    setTrying(true)
    setState(await checkToken())
    setTrying(false)
  }

  const says = trying ? 'admin.tokenTrying'
    : state === 'ok' ? 'admin.tokenOk'
    : state === 'token' ? 'admin.tokenRefused'
    : state === 'network' ? 'admin.tokenNetwork'
    : 'admin.tokenUnknown'
  const wrong = !trying && (state === 'token' || state === 'network')

  return (
    <section className="rounded-2xl p-5" style={{ background: C.card, border: bd }}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{translate('admin.writeAccess')}</p>
      <p className="mb-3 text-[13px]" style={{ color: C.muted }}>{translate('admin.writeAccessHelp')}</p>
      <div className="flex flex-wrap items-center gap-2 py-1">
        <input
          type="password" value={value} onChange={(e) => setValue(e.target.value)}
          aria-label={translate('admin.token')} placeholder={translate('admin.token')}
          className="min-w-[12rem] flex-1 rounded-xl px-4 py-3 text-sm outline-none transition focus:border-[var(--c-accent)]"
          style={{ background: C.panel, border: bd, color: C.text }}
        />
        <button onClick={verify} disabled={trying}
          className="rounded-xl px-5 py-3 text-sm font-bold text-[var(--c-on-brand)] disabled:opacity-40"
          style={{ background: C.brand }}>
          {translate('admin.checkToken')}
        </button>
      </div>
      <p aria-live="polite" className="pb-1 text-[13px] font-semibold"
        style={{ color: wrong ? C.danger : state === 'ok' ? C.green : C.muted }}>
        {translate(says)}
      </p>
    </section>
  )
}
