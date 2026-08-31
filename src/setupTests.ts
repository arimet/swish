import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'
import { installFakeApi, resetStore } from './test/fakeApi'

/* The database is the only place the application's data lives, so a test without a
   server is a test without data. The fake API stands in for it, and it is emptied
   before every test: one test's writes must never reach the next. */
installFakeApi()
beforeEach(resetStore)
