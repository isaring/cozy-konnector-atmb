const {
  BaseKonnector,
  requestFactory,
  scrape,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  // The debug mode shows all the details about HTTP requests and responses. Very useful for
  // debugging but very verbose. This is why it is commented out by default
  // debug: true,
  // Activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // This allows request-promise to keep cookies between requests
  jar: true
})

const VENDOR = 'ATMB'
const baseUrl = 'https://www.atmb.com'
const billsUrl = baseUrl + '/espace-abonne/factures/'
const monthsLong = {
  Janvier: '01',
  Février: '02',
  Mars: '03',
  Avril: '04',
  Mai: '05',
  Juin: '06',
  Juillet: '07',
  Août: '08',
  Septembre: '09',
  Octobre: '10',
  Novembre: '11',
  Décembre: '12'
}

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
// cozyParameters are static parameters, independents from the account. Most often, it can be a
// secret api key.
async function start(fields, cozyParameters) {
  log('info', 'Authenticating ...')
  if (cozyParameters) log('debug', 'Found COZY_PARAMETERS')
  await authenticate.bind(this)(fields.log, fields.pwd)
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of documents')
  const $ = await request(`${billsUrl}`)
  // cheerio (https://cheerio.js.org/) uses the same api as jQuery (http://jquery.com/)
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)

  // Here we use the saveBills function even if what we fetch are not bills,
  // but this is the most common case in connectors
  log('info', 'Saving data to Cozy')
  await this.saveBills(documents, fields, {
    // This is a bank identifier which will be used to link bills to bank operations. These
    // identifiers should be at least a word found in the title of a bank operation related to this
    // bill. It is not case-sensitive.
    identifiers: ['atmb'],
    contentType: 'application/pdf'
  })
}

// This shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
function authenticate(username, password) {
  return this.signin({
    url: baseUrl,
    formSelector: 'form#form-login-modal',
    formData: { log: username, pwd: password },
    // The validate function will check if the login request was a success. Every website has a
    // different way to respond: HTTP status code, error message in HTML ($), HTTP redirection
    // (fullResponse.request.uri.href)...
    validate: statusCode => {
      return statusCode === 200 || log('error', 'Invalid credentials')
    }
  })
}

// The goal of this function is to parse a HTML page wrapped by a cheerio instance
// and return an array of JS objects which will be saved to the cozy by saveBills
// (https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#savebills)
function parseDocuments($) {
  // You can find documentation about the scrape function here:
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape
  const docs = scrape(
    $,
    {
      period: {
        sel: 'th'
      },
      vendorRef: {
        sel: 'td:nth-child(2)'
      },
      fileurl: {
        sel: 'td.text-right a',
        attr: 'href',
        parse: href => `${billsUrl}/${href}`
      }
    },
    'main table.table.subscription-table.table-module tr.bill-line.paid'
  )
  return docs.map(doc => ({
    ...doc,
    // The saveBills function needs a date field
    // even if it is a little artificial here (these are not real bills)
    date: new Date(),
    currency: 'EUR',
    filename: `${filename(doc)}.pdf`,
    vendor: VENDOR
  }))

  function filename(doc) {
    let arr = doc.period.split(' ')
    return arr[1] + '_' + monthsLong[arr[0]] + '_' + doc.vendorRef
  }
}
