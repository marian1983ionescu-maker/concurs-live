/* AICI INCEPE CODUL - FUNCTIA joinGame ACTUALIZATA */

async function joinGame() {
  const phoneClean = phone.replace(/\s+/g, "");
  const emailClean = email.trim().toLowerCase();
  const nameClean = playerName.trim();

  const phoneRegex = /^07[0-9]{8}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!nameClean) {
    alert("Completeaza numele complet.");
    return;
  }

  if (!phoneRegex.test(phoneClean)) {
    alert("Telefon invalid. Introdu un numar valid, de forma 07XXXXXXXX.");
    return;
  }

  if (!emailRegex.test(emailClean)) {
    alert("Email invalid. Introdu o adresa de email valida.");
    return;
  }

  const ipResponse = await fetch("/api/client-ip");
  const ipData = await ipResponse.json();
  const userIp = ipData?.ip || "unknown";

  const { data: duplicatePlayers } = await supabase
    .from("players")
    .select("*")
    .or(`phone.eq.${phoneClean},email.eq.${emailClean},ip.eq.${userIp}`)
    .limit(1);

  if (duplicatePlayers && duplicatePlayers.length > 0) {
    const duplicate = duplicatePlayers[0];

    if (duplicate.phone === phoneClean) {
      alert("Acest numar de telefon este deja inscris in concurs.");
      return;
    }

    if (duplicate.email === emailClean) {
      alert("Acest email este deja inscris in concurs.");
      return;
    }

    if (duplicate.ip === userIp) {
      alert("De pe acest dispozitiv / IP exista deja o inscriere.");
      return;
    }

    alert("Exista deja o inscriere cu aceste date.");
    return;
  }

  localStorage.setItem(
    "concurs_player",
    JSON.stringify({
      name: nameClean,
      phone: phoneClean,
      email: emailClean,
      ip: userIp,
    })
  );

  await supabase.from("players").insert([
    {
      name: nameClean,
      phone: phoneClean,
      email: emailClean,
      ip: userIp,
      score: 0,
    },
  ]);

  setPlayerName(nameClean);
  setPhone(phoneClean);
  setEmail(emailClean);
  setJoined(true);

  loadPlayers();
}

/* AICI SE TERMINA CODUL - FUNCTIA joinGame ACTUALIZATA */