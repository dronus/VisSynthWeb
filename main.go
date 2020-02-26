package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"text/template"
	"time"
)

type Config struct {
	Url string
}

type Mailer struct {
	Host string
	Port int
	User string
	Pass string
	From string
	Name string
	Subj string
	Body string
}

func categories() map[string][]string {
	all := make(map[string][]string)

	dirs, err := ioutil.ReadDir("./static/themes")
	if err != nil {
		log.Fatal(err)
	}

	for _, d := range dirs {
		var names []string

		files, err := ioutil.ReadDir("./static/themes/" + d.Name())
		if err != nil {
			log.Fatal(err)
		}

		for _, f := range files {
			names = append(names, f.Name())
		}

		all[d.Name()] = names
	}

	return all
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	t, _ := template.ParseFiles("./index.html")
	t.Execute(w, categories())
}

func (m *Mailer) saveHandler(w http.ResponseWriter, r *http.Request) {
	decoder := json.NewDecoder(r.Body)
	var data struct {
		Id     string
		Cat    string
		Email  string
		Img    string
		Mailer *Mailer
	}

	err := decoder.Decode(&data)
	if err != nil {
		log.Println(err)
	}

	data.Mailer = m
	t, _ := template.ParseFiles("./email.html")
	var b bytes.Buffer
	t.Execute(&b, struct{ Id, Cat string }{data.Id, data.Cat})
	data.Mailer.Body = b.String()

	bytes, err := json.Marshal(data)
	if err != nil {
		log.Println(err)
	}

	err = ioutil.WriteFile("./out/"+fmt.Sprintf("%d", time.Now().Unix())+".json", bytes, 0644)
	if err != nil {
		log.Println(err)
	}
}

func main() {
	_ = os.Mkdir("./out", 0755)

	var cfg *Config
	var m *Mailer

	j, _ := ioutil.ReadFile("config.json")
	if err := json.Unmarshal(j, &cfg); err != nil {
		log.Fatal(err)
	}

	j, _ = ioutil.ReadFile("mailer.json")
	if err := json.Unmarshal(j, &m); err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/save", m.saveHandler)

	http.HandleFunc("/static/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, r.URL.Path[1:])
	})

	http.HandleFunc("/out/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, r.URL.Path[1:])
	})

	log.Fatal(http.ListenAndServe(cfg.Url, nil))
}
