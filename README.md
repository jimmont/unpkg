# unpkg
reduce effort required to use JavaScript imports by importing locally from unpkg.com

see https://jimmont.github.io/unpkg/

synopsis

* get the script either with curl or wget:
`wget 'https://jimmont.github.io/unpkg/unpkg.js'`
`curl -O 'https://jimmont.github.io/unpkg/unpkg.js'`

* run it to see the options:
`node ./unpkg.js`

* get lit-element and its dependencies:
`node ./unpkg.js url='https://unpkg.com/lit-element'`

* import lit-element into working JavaScript:
`import * from "./unpkg-src/lit-element/unpkg.js"`

...

Be free to focus on work rather than build processes.

Hire me.
