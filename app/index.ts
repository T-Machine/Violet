import * as Koa from 'koa'
import * as cors from '@koa/cors'
import * as bodyParser from 'koa-bodyparser'
import * as helmet from 'koa-helmet'
import * as morgan from 'koa-morgan'
import * as session from 'koa-session'

import { IState, ICustom } from '../types/context'
import * as redis from './model/redis'
import * as router from './router'
import config from './config/config'

const app = new Koa<IState, ICustom>()

// HTTP log
if (config!.http.dev) app.use(morgan('dev'))

// HTTPS 安全
app.use(helmet())
app.use(cors({ credentials: true }))

// Session
app.keys = ['cookieKey']
app.use(
  session(
    {
      key: 'koa:sess',
      maxAge: 1296000000,
      overwrite: true,
      httpOnly: true,
      signed: true,
      rolling: false,
      store: redis.getSessionStore()
    },
    app as any
  )
)

// JSON and form to object
app.use(bodyParser())

// Routes
app.use(router.routes())

export = app
