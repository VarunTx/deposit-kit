import './app.css'

const steps = [
  { title: 'Move-in proof', body: 'Walk through each room and take photos. Each photo gets a timestamp that proves when it was taken, without uploading it.' },
  { title: 'Move-out check', body: 'Take the same photos when you leave and compare them side by side with move-in.' },
  { title: 'Get your deposit back', body: 'See your state’s deadline for returning the deposit, and send a letter that cites the law.' },
]

export function App() {
  return (
    <main class="page">
      <header>
        <h1>Deposit Kit</h1>
        <p class="lede">Prove your rental’s condition and get your security deposit back. Free. Your photos stay on your phone.</p>
      </header>
      <ol class="steps">
        {steps.map((step, i) => (
          <li key={step.title}>
            <span class="num">{i + 1}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <footer>
        <p>Deposit Kit gives you templates and deadlines, not legal advice. Check your state’s law or a tenant rights group if you’re unsure.</p>
      </footer>
    </main>
  )
}
